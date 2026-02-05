const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const { Pool } = require('pg');
require('dotenv').config();

// Global variable to store database credentials
let dbConfig = null;
let pool = null;

const app = express();
const port = 3000;

// Check for environment variables
if (process.env.DB_HOST && process.env.DB_PORT && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
    dbConfig = {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    };
    pool = new Pool(dbConfig);
    console.log("Database configured via environment variables.");
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // For CSS/Images if needed
app.set('view engine', 'ejs');

app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
}));

function isAuthenticated(req, res, next) {
    // TODO: Implement authentication check
    console.log("Session checking:", req.session.user);
    if(!req.session.user) {
        return res.redirect("/login");
    }
    next();
}

function isInstructor(req, res, next) {
    // TODO: Implement check for instructor role
    if(req.session.user.role !== "instructor") {
        return res.status(403).send("Access denied: Instructors only allowed");
    }
    next();
}

// Function to get or initialize the pool
function getPool() {
    if (!pool && dbConfig) {
        pool = new Pool(dbConfig);
    }
    return pool;
}

// Route to serve the credentials form
// Route to serve the credentials form - DEPRECATED
// app.get('/', (req, res) => {
//     if (dbConfig) {
//         res.redirect('/login');
//     } else {
//         res.render('credentials');
//     }
// });

app.get('/', (req, res) => {
    res.redirect('/login');
});

// Route to handle credentials submission - DEPRECATED
// app.post('/set-credentials', (req, res) => {
//     ...
// });


app.get('/login', (req, res) => {
    res.render('login', {error: null});
});

// TODO: Implement user login logic
// 1. Check credentials in Users table
// 2. Set session user
// 3. Redirect to appropriate dashboard based on role
app.post('/login', async (req, res) => {
   const {username, password}= req.body; //destructuring comes from one object
   try {
        //initiaing pool and upon query a db connection is formed
        const pool = getPool();
        console.log("POOL=",pool);
        const result = await pool.query(
            'SELECT * from users where username=$1',[username]
        );

        //1.checking user credentials
        if(result.rows.length == 0) {
            return res.render("login",{error:"Invalid credentials entered"});
        }

        const curr_user= result.rows[0];
        if(curr_user.password !== password) {
            return res.render("login",{error:"Invalid credentials entered"});
        }

        //2.storing the user object
        req.session.user = {
            user_id : curr_user.user_id,
            role : curr_user.role,
            full_name: curr_user.full_name
        };

        console.log("Session is set for : ", req.session.user);

        //3.redirecting to corresponding page based on role
        if(curr_user.role == "student") {
            res.redirect("/student/dashboard");
        }
        else if(curr_user.role == "instructor") {
            res.redirect("/instructor/dashboard");
        }
        else {
            res.render("login",{error:"Unknown role"});
        }
   }
   catch (err) {
    console.error(err);
    res.status(500).send("Database error");
   }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});


// TODO: Render student dashboard
// 1. Fetch registered courses for the student
// 2. Fetch all available courses (exclude registered ones)
// 3. Calculate total credits
app.get('/student/dashboard', isAuthenticated, async (req, res) => {
    try {
        const pool = getPool();
        const studentId = req.session.user.user_id;
        const { error, success } = req.query;

        // Courses the student is currently registered in
        const registered_result = await pool.query(
            `select c.course_id,c.course_name,c.credits,c.slot, c.capacity, users.full_name as instructor_name
             from Registrations as reg  join Courses as c ON reg.course_id = c.course_id  left join Users as  users ON c.instructor_id = users.user_id
             where reg.student_id = $1 AND reg.status = 'enrolled'
             ORDER BY c.course_id`,
            [studentId]
        );

        const registered_courses = registered_result.rows;
        const total_credits = registered_courses.reduce((sum, course) => sum + (course.credits || 0), 0);

        // Courses available to register (exclude already registered ones)
        const available_result = await pool.query(
            `select c.course_id,c.course_name,c.credits, c.slot, c.capacity, users.full_name as instructor_name
             from Courses as  c  left join Users  as users ON c.instructor_id = users.user_id
             where c.course_id not in ( select course_id FROM Registrations  where student_id = $1 and status = 'enrolled')
             order by c.course_id`,
            [studentId]
        );

        const available_courses = available_result.rows;

        res.render('student_dashboard', {
            user: req.session.user,
            registered_courses,
            available_courses,
            total_credits,
            error: error || null,
            success: success || null
        });
    } catch (err) {
        console.error('Error loading student dashboard:', err);
        res.status(500).send('Database error');
    }
});

// TODO: Implement registration logic
// 1. Check if course exists
// 2. Check for Slot Clash (Cannot register for same slot twice)
// 3. Check Credit Limit (Max 24 credits)
// 4. Check Course Capacity (Optional)
// 5. Insert into Registrations table
app.post('/student/register', isAuthenticated, async (req, res) => {
    const { course_id } = req.body;
    const studentId = req.session.user.user_id;

    if (!course_id) {
        return res.redirect('/student/dashboard?error=' + encodeURIComponent('Missing course ID.'));
    }

    try {
        const pool = getPool();

        // 1.check if course exists
        const course_result = await pool.query( 'select course_id, course_name, credits, slot, capacity from courses where course_id = $1',[course_id] );
        if (course_result.rows.length === 0) {
            return res.redirect('/student/dashboard?error=' + encodeURIComponent('Course not found.'));
        }
        const course = course_result.rows[0];

        // 2. check whether they are already registered for this course or not
        const duplicate_result = await pool.query(
            'SELECT registration_id FROM Registrations WHERE student_id = $1 AND course_id = $2 AND status = $3',
            [studentId, course.course_id, 'enrolled']
        );
        if (duplicate_result.rows.length > 0) {
            return res.redirect('/student/dashboard?error=' + encodeURIComponent('You are already registered for this course.'));
        }

        // 3. Check for Slot Clash (Cannot register for same slot twice)
        const slotclash_result = await pool.query(
            `select 1 from Registrations as reg  join Courses as  c on reg.course_id = c.course_id
             where reg.student_id = $1 and  reg.status = 'enrolled' and c.slot = $2
             LIMIT 1`, [studentId, course.slot]
        );

        if (slotclash_result.rows.length > 0) {
            return res.redirect('/student/dashboard?error=' + encodeURIComponent('Slot clash: you are already registered for another course in this slot.'));
        }

        // 4. Credit Limit: total existing credits + this course <= 24
        const credits_result = await pool.query(
            `select coalesce(sum(c.credits), 0) as total_credits
             from Registrations  as reg join Courses as c ON reg.course_id = c.course_id
             where reg.student_id = $1 AND reg.status = 'enrolled'`,
            [studentId]
        );

        const current_credits = parseInt(credits_result.rows[0].total_credits, 10) || 0;
        const newtotal_credits = current_credits + course.credits;
        const credit_limit = 24;

        if (newtotal_credits > credit_limit) { return res.redirect('/student/dashboard?error=' + encodeURIComponent('Credit limit exceeded: cannot register beyond 24 credits.')); }

        // 5. Course Capacity (which is given as optional)
        const capacity_result = await pool.query(
            'select  count(*)::int AS enrolled_count from Registrations where course_id = $1 AND status = $2',
            [course.course_id, 'enrolled']
        );

        const enrolled_count = capacity_result.rows[0].enrolled_count || 0;
        if (course.capacity !== null && enrolled_count >= course.capacity) {
            return res.redirect('/student/dashboard?error=' + encodeURIComponent('Course is full: no seats available.'));
        }

        // Now, since  all checks passed: insert registration
        await pool.query(
            'insert into Registrations (student_id, course_id, status) VALUES ($1, $2, $3)',
            [studentId, course.course_id, 'enrolled']
        );

        return res.redirect('/student/dashboard?success=' + encodeURIComponent('Successfully registered for ' + course.course_id + '.'));
    } catch (err) {
        console.error('Error during registration:', err);
        return res.redirect('/student/dashboard?error=' + encodeURIComponent('An unexpected error occurred during registration.'));
    }
});

// TODO: Implement drop logic
// 1. Delete from Registrations table
app.post('/student/drop', isAuthenticated, async (req, res) => {
    const { course_id } = req.body;
    const studentId = req.session.user.user_id;

    if (!course_id) {
        return res.redirect('/student/dashboard?error=' + encodeURIComponent('Missing course ID.'));
    }

    try {
        const pool = getPool();

        const result = await pool.query( 'delete from Registrations where student_id = $1 and course_id = $2 and status = $3 RETURNING registration_id', [studentId, course_id, 'enrolled'] );

        if (result.rows.length === 0) { return res.redirect('/student/dashboard?error=' + encodeURIComponent('You are not registered for this course.'));}

        return res.redirect('/student/dashboard?success=' + encodeURIComponent('Successfully dropped ' + course_id + '.'));
    } catch (err) {
        console.error('Error dropping course:', err);
        return res.redirect('/student/dashboard?error=' + encodeURIComponent('An unexpected error occurred while dropping the course.'));
    }
});


// TODO: Render instructor dashboard
// 1. First , fetch courses taught by this instructor
app.get('/instructor/dashboard', isAuthenticated, isInstructor, async (req, res) => {
    try {
        const pool = getPool();
        const instructorId = req.session.user.user_id;
        const result = await pool.query('select course_id, course_name, credits, slot from Courses where instructor_id = $1 order by course_id',[instructorId]);
        res.render('instructor_dashboard', {user: req.session.user, courses: result.rows});
    } 
    catch (err) {
        console.error('Error loading instructor dashboard:', err);
        res.status(500).send('Database error');
    }
});

// TODO: Show students enrolled in a specific course
// 1. Verify instructor owns the course
// 2. Fetch enrolled students
app.get('/instructor/course/:id', isAuthenticated, isInstructor, async (req, res) => {
    const courseId = req.params.id;
    const instructorId = req.session.user.user_id;

    try {
        const pool = getPool();
        // verifing that this course belongs to the logged-in instructor
        const course_result = await pool.query('select course_id, course_name, credits from Courses WHERE course_id = $1 AND instructor_id = $2',[courseId, instructorId]);
        if (course_result.rows.length === 0) { return res.status(404).send('Course not found or access denied'); }
        const course = course_result.rows[0];
        // Fetch enrolled students for this course
        const students_result = await pool.query(`select u.user_id, u.username, u.full_name from Registrations as  r join Users  as u ON r.student_id = u.user_id  where r.course_id = $1 AND r.status = 'enrolled' order by u.user_id`,[courseId] );
        res.render('instructor_course', {user: req.session.user,course,students: students_result.rows, message: null,warning: null, error: null});
    } 
    catch (err) {
        console.error('Error loading course details:', err);
        res.status(500).send('Database error');
    }
});


// TODO: Implement manual student addition
// 1. Check if student exists
// 2. Check if already enrolled
// 3. Check Credit Limit (If exceeded, allow but show WARNING)
// 4. Insert into Registrations
app.post('/instructor/add-student', isAuthenticated, isInstructor, async (req, res) => {
    const { course_id, username } = req.body;
    const instructorId = req.session.user.user_id;

    if (!course_id || !username) {
        return res.status(400).send('Missing course_id or username');
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const course_result = await client.query('select course_id, course_name, credits FROM Courses WHERE course_id = $1 AND instructor_id = $2',[course_id, instructorId]);
        if (course_result.rows.length === 0) { await client.query('ROLLBACK');client.release();return res.status(404).send('Course not found or access denied');}
        const course = course_result.rows[0];

        const student_result = await client.query('select user_id, username, full_name from Users WHERE username = $1 and role = $2',[username, 'student']);

        if (student_result.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            // Reload page with error message
            const students_result = await pool.query(`SELECT u.user_id, u.username, u.full_name FROM Registrations r JOIN Users u ON r.student_id = u.user_id
                 WHERE r.course_id = $1 AND r.status = 'enrolled'  ORDER BY u.user_id`, [course_id] );

            return res.render('instructor_course', {user: req.session.user, course, students: students_result.rows, message: null,warning: null, error: 'Student with that username not found.'});
        }

        const student = student_result.rows[0];

        // Check if already enrolled
        const existing_reg = await client.query(
            'SELECT registration_id FROM Registrations WHERE student_id = $1 AND course_id = $2',
            [student.user_id, course_id]
        );

        if (existing_reg.rows.length > 0) {
            await client.query('ROLLBACK');
            client.release();

            const students_result = await pool.query(`SELECT u.user_id, u.username, u.full_name FROM Registrations r JOIN Users u ON r.student_id = u.user_id 
                WHERE r.course_id = $1 AND r.status = 'enrolled' ORDER BY u.user_id`,[course_id]);

            return res.render('instructor_course', { user: req.session.user, course, students: students_result.rows, message: null, warning: null, error: 'Student is already enrolled in this course.'});
        }

        // Calculate current total credits for the student
        const credits_result = await client.query(
            `SELECT COALESCE(SUM(c.credits), 0) AS total_credits
             FROM Registrations r
             JOIN Courses c ON r.course_id = c.course_id
             WHERE r.student_id = $1 AND r.status = 'enrolled'`,
            [student.user_id]
        );

        const current_credits = parseInt(credits_result.rows[0].total_credits, 10) || 0;
        const newtotal_credits = current_credits + course.credits;
        const creditlimit = 24;

                // Check for slot clash: student already has another course in this slot
                const slotClashResult = await client.query(
                        `SELECT 1
                         FROM Registrations r
                         JOIN Courses c ON r.course_id = c.course_id
                         WHERE r.student_id = $1
                             AND r.status = 'enrolled'
                             AND c.slot = $2
                         LIMIT 1`,
                        [student.user_id, course.slot]
                );

                const hasSlotClash = slotClashResult.rows.length > 0;

                // Insert registration regardless of credit limit or slot clash (override behavior)
        await client.query(
            'INSERT INTO Registrations (student_id, course_id, status) VALUES ($1, $2, $3)',
            [student.user_id, course.course_id, 'enrolled']
        );

        await client.query('COMMIT');
        client.release();

        // Reload students list for rendering
        const studentsResult = await pool.query(`SELECT u.user_id, u.username, u.full_name FROM Registrations r JOIN Users u ON r.student_id = u.user_id
             WHERE r.course_id = $1 AND r.status = 'enrolled'
             ORDER BY u.user_id`,
            [course_id]);

        let message = 'Student added successfully.';
        let warning = null;
        if (newtotal_credits > creditlimit) { warning = 'Student added, but credit limit exceeded for that student!';}
        return res.render('instructor_course', { user: req.session.user, course,students: studentsResult.rows, message, warning, error: null});
    } catch (err) {
        console.error('Error adding student:', err);
        try {
            await client.query('ROLLBACK');
        } catch (e) {
            console.error('Rollback failed:', e);
        }
        client.release();
        res.status(500).send('Database error');
    }
});


// TODO: Implement student removal
// 1. Delete from Registrations
app.post('/instructor/remove-student', isAuthenticated, isInstructor, async (req, res) => {
    const { course_id, student_id } = req.body;
    const instructorId = req.session.user.user_id;

    if (!course_id || !student_id) {return res.status(400).send('Missing course_id or student_id');}

    try {
        const pool = getPool();
        const course_result = await pool.query('SELECT course_id, course_name, credits FROM Courses WHERE course_id = $1 AND instructor_id = $2',[course_id, instructorId]);
        if (course_result.rows.length === 0) {return res.status(404).send('Course not found or access denied');}
        const course = course_result.rows[0];
        await pool.query('DELETE FROM Registrations WHERE student_id = $1 AND course_id = $2',[student_id, course_id] );
        const studentsResult = await pool.query(`SELECT u.user_id, u.username, u.full_name FROM Registrations r JOIN Users u ON r.student_id = u.user_id WHERE r.course_id = $1 AND r.status = 'enrolled' ORDER BY u.user_id`,  [course_id] );
        return res.render('instructor_course', { user: req.session.user, course, students: studentsResult.rows, message: 'Student removed successfully.', warning: null, error: null });
    } 
    catch (err) {
        console.error('Error removing student:', err);
        res.status(500).send('Database error');
    }
});


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
