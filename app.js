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
    console.log("SESSION CHECK:", req.session.user);
    if(!req.session.user) {
        return res.redirect("/login");
    }
    next();
}

function isInstructor(req, res, next) {
    // TODO: Implement check for instructor role
    if(req.session.user.role !== "instructor") {
        return res.status(403).send("Access denied: Instructors only");
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

        const user= result.rows[0];
        if(user.password !== password) {
            return res.render("login",{error:"Invalid credentials entered"});
        }

        //2.storing the user object
        req.session.user = {
            user_id : user.user_id,
            role : user.role,
            full_name: user.full_name
        };

        console.log("SESSION SET:", req.session.user);

        //3.redirecting to corresponding page based on role
        if(user.role == "student") {
            res.redirect("/student/dashboard");
        }
        else if(user.role == "instructor") {
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
        const registeredResult = await pool.query(
            `SELECT c.course_id,
                    c.course_name,
                    c.credits,
                    c.slot,
                    c.capacity,
                    u.full_name AS instructor_name
             FROM Registrations r
             JOIN Courses c ON r.course_id = c.course_id
             LEFT JOIN Users u ON c.instructor_id = u.user_id
             WHERE r.student_id = $1 AND r.status = 'enrolled'
             ORDER BY c.course_id`,
            [studentId]
        );

        const registeredCourses = registeredResult.rows;
        const totalCredits = registeredCourses.reduce((sum, course) => sum + (course.credits || 0), 0);

        // Courses available to register (exclude already registered ones)
        const availableResult = await pool.query(
            `SELECT c.course_id,
                    c.course_name,
                    c.credits,
                    c.slot,
                    c.capacity,
                    u.full_name AS instructor_name
             FROM Courses c
             LEFT JOIN Users u ON c.instructor_id = u.user_id
             WHERE c.course_id NOT IN (
                 SELECT course_id FROM Registrations
                 WHERE student_id = $1 AND status = 'enrolled'
             )
             ORDER BY c.course_id`,
            [studentId]
        );

        const availableCourses = availableResult.rows;

        res.render('student_dashboard', {
            user: req.session.user,
            registeredCourses,
            availableCourses,
            totalCredits,
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

        // 1. Check if course exists
        const courseResult = await pool.query(
            'SELECT course_id, course_name, credits, slot, capacity FROM Courses WHERE course_id = $1',
            [course_id]
        );

        if (courseResult.rows.length === 0) {
            return res.redirect('/student/dashboard?error=' + encodeURIComponent('Course not found.'));
        }

        const course = courseResult.rows[0];

        // 2. Duplicate Check: already registered for this course
        const duplicateResult = await pool.query(
            'SELECT registration_id FROM Registrations WHERE student_id = $1 AND course_id = $2 AND status = $3',
            [studentId, course.course_id, 'enrolled']
        );

        if (duplicateResult.rows.length > 0) {
            return res.redirect('/student/dashboard?error=' + encodeURIComponent('You are already registered for this course.'));
        }

        // 3. Slot Clash: any existing course in same slot
        const slotClashResult = await pool.query(
            `SELECT 1
             FROM Registrations r
             JOIN Courses c ON r.course_id = c.course_id
             WHERE r.student_id = $1
               AND r.status = 'enrolled'
               AND c.slot = $2
             LIMIT 1`,
            [studentId, course.slot]
        );

        if (slotClashResult.rows.length > 0) {
            return res.redirect('/student/dashboard?error=' + encodeURIComponent('Slot clash: you are already registered for another course in this slot.'));
        }

        // 4. Credit Limit: total existing credits + this course <= 24
        const creditsResult = await pool.query(
            `SELECT COALESCE(SUM(c.credits), 0) AS total_credits
             FROM Registrations r
             JOIN Courses c ON r.course_id = c.course_id
             WHERE r.student_id = $1 AND r.status = 'enrolled'`,
            [studentId]
        );

        const currentCredits = parseInt(creditsResult.rows[0].total_credits, 10) || 0;
        const newTotalCredits = currentCredits + course.credits;
        const creditLimit = 24;

        if (newTotalCredits > creditLimit) {
            return res.redirect('/student/dashboard?error=' + encodeURIComponent('Credit limit exceeded: cannot register beyond 24 credits.'));
        }

        // 5. Course Capacity (optional)
        const capacityResult = await pool.query(
            'SELECT COUNT(*)::int AS enrolled_count FROM Registrations WHERE course_id = $1 AND status = $2',
            [course.course_id, 'enrolled']
        );

        const enrolledCount = capacityResult.rows[0].enrolled_count || 0;
        if (course.capacity !== null && enrolledCount >= course.capacity) {
            return res.redirect('/student/dashboard?error=' + encodeURIComponent('Course is full: no seats available.'));
        }

        // All checks passed: insert registration
        await pool.query(
            'INSERT INTO Registrations (student_id, course_id, status) VALUES ($1, $2, $3)',
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

        const result = await pool.query(
            'DELETE FROM Registrations WHERE student_id = $1 AND course_id = $2 AND status = $3 RETURNING registration_id',
            [studentId, course_id, 'enrolled']
        );

        if (result.rows.length === 0) {
            return res.redirect('/student/dashboard?error=' + encodeURIComponent('You are not registered for this course.'));
        }

        return res.redirect('/student/dashboard?success=' + encodeURIComponent('Successfully dropped ' + course_id + '.'));
    } catch (err) {
        console.error('Error dropping course:', err);
        return res.redirect('/student/dashboard?error=' + encodeURIComponent('An unexpected error occurred while dropping the course.'));
    }
});


// TODO: Render instructor dashboard
// 1. Fetch courses taught by this instructor
app.get('/instructor/dashboard', isAuthenticated, isInstructor, async (req, res) => {
    try {
        const pool = getPool();
        const instructorId = req.session.user.user_id;

        const result = await pool.query(
            'SELECT course_id, course_name, credits, slot FROM Courses WHERE instructor_id = $1 ORDER BY course_id',
            [instructorId]
        );

        res.render('instructor_dashboard', {
            user: req.session.user,
            courses: result.rows
        });
    } catch (err) {
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

        // Verify that this course belongs to the logged-in instructor
        const courseResult = await pool.query(
            'SELECT course_id, course_name, credits FROM Courses WHERE course_id = $1 AND instructor_id = $2',
            [courseId, instructorId]
        );

        if (courseResult.rows.length === 0) {
            return res.status(404).send('Course not found or access denied');
        }

        const course = courseResult.rows[0];

        // Fetch enrolled students for this course
        const studentsResult = await pool.query(
            `SELECT u.user_id, u.username, u.full_name
             FROM Registrations r
             JOIN Users u ON r.student_id = u.user_id
             WHERE r.course_id = $1 AND r.status = 'enrolled'
             ORDER BY u.user_id`,
            [courseId]
        );

        res.render('instructor_course', {
            user: req.session.user,
            course,
            students: studentsResult.rows,
            message: null,
            warning: null,
            error: null
        });
    } catch (err) {
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

        // Verify that this course belongs to the logged-in instructor
        const courseResult = await client.query(
            'SELECT course_id, course_name, credits FROM Courses WHERE course_id = $1 AND instructor_id = $2',
            [course_id, instructorId]
        );

        if (courseResult.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).send('Course not found or access denied');
        }

        const course = courseResult.rows[0];

        // Check if student exists and is a student
        const studentResult = await client.query(
            'SELECT user_id, username, full_name FROM Users WHERE username = $1 AND role = $2',
            [username, 'student']
        );

        if (studentResult.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();

            // Reload page with error message
            const studentsResult = await pool.query(
                `SELECT u.user_id, u.username, u.full_name
                 FROM Registrations r
                 JOIN Users u ON r.student_id = u.user_id
                 WHERE r.course_id = $1 AND r.status = 'enrolled'
                 ORDER BY u.user_id`,
                [course_id]
            );

            return res.render('instructor_course', {
                user: req.session.user,
                course,
                students: studentsResult.rows,
                message: null,
                warning: null,
                error: 'Student with that username not found.'
            });
        }

        const student = studentResult.rows[0];

        // Check if already enrolled
        const existingReg = await client.query(
            'SELECT registration_id FROM Registrations WHERE student_id = $1 AND course_id = $2',
            [student.user_id, course_id]
        );

        if (existingReg.rows.length > 0) {
            await client.query('ROLLBACK');
            client.release();

            const studentsResult = await pool.query(
                `SELECT u.user_id, u.username, u.full_name
                 FROM Registrations r
                 JOIN Users u ON r.student_id = u.user_id
                 WHERE r.course_id = $1 AND r.status = 'enrolled'
                 ORDER BY u.user_id`,
                [course_id]
            );

            return res.render('instructor_course', {
                user: req.session.user,
                course,
                students: studentsResult.rows,
                message: null,
                warning: null,
                error: 'Student is already enrolled in this course.'
            });
        }

        // Calculate current total credits for the student
        const creditsResult = await client.query(
            `SELECT COALESCE(SUM(c.credits), 0) AS total_credits
             FROM Registrations r
             JOIN Courses c ON r.course_id = c.course_id
             WHERE r.student_id = $1 AND r.status = 'enrolled'`,
            [student.user_id]
        );

        const currentCredits = parseInt(creditsResult.rows[0].total_credits, 10) || 0;
        const newTotalCredits = currentCredits + course.credits;
        const creditLimit = 24;

        // Insert registration regardless of credit limit (override behavior)
        await client.query(
            'INSERT INTO Registrations (student_id, course_id, status) VALUES ($1, $2, $3)',
            [student.user_id, course.course_id, 'enrolled']
        );

        await client.query('COMMIT');
        client.release();

        // Reload students list for rendering
        const studentsResult = await pool.query(
            `SELECT u.user_id, u.username, u.full_name
             FROM Registrations r
             JOIN Users u ON r.student_id = u.user_id
             WHERE r.course_id = $1 AND r.status = 'enrolled'
             ORDER BY u.user_id`,
            [course_id]
        );

        let message = 'Student added successfully.';
        let warning = null;
        if (newTotalCredits > creditLimit) {
            warning = 'Student added, but credit limit exceeded!';
        }

        return res.render('instructor_course', {
            user: req.session.user,
            course,
            students: studentsResult.rows,
            message,
            warning,
            error: null
        });
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

    if (!course_id || !student_id) {
        return res.status(400).send('Missing course_id or student_id');
    }

    try {
        const pool = getPool();

        // Verify that this course belongs to the logged-in instructor
        const courseResult = await pool.query(
            'SELECT course_id, course_name, credits FROM Courses WHERE course_id = $1 AND instructor_id = $2',
            [course_id, instructorId]
        );

        if (courseResult.rows.length === 0) {
            return res.status(404).send('Course not found or access denied');
        }

        const course = courseResult.rows[0];

        await pool.query(
            'DELETE FROM Registrations WHERE student_id = $1 AND course_id = $2',
            [student_id, course_id]
        );

        // Reload students list after removal
        const studentsResult = await pool.query(
            `SELECT u.user_id, u.username, u.full_name
             FROM Registrations r
             JOIN Users u ON r.student_id = u.user_id
             WHERE r.course_id = $1 AND r.status = 'enrolled'
             ORDER BY u.user_id`,
            [course_id]
        );

        return res.render('instructor_course', {
            user: req.session.user,
            course,
            students: studentsResult.rows,
            message: 'Student removed successfully.',
            warning: null,
            error: null
        });
    } catch (err) {
        console.error('Error removing student:', err);
        res.status(500).send('Database error');
    }
});


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
