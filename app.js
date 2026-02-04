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
    res.send(`Welcome Student $(req.session.user.full_name `);
});

// TODO: Implement registration logic
// 1. Check if course exists
// 2. Check for Slot Clash (Cannot register for same slot twice)
// 3. Check Credit Limit (Max 24 credits)
// 4. Check Course Capacity (Optional)
// 5. Insert into Registrations table
app.post('/student/register', isAuthenticated, async (req, res) => {

});

// TODO: Implement drop logic
// 1. Delete from Registrations table
app.post('/student/drop', isAuthenticated, async (req, res) => {

});


// TODO: Render instructor dashboard
// 1. Fetch courses taught by this instructor
app.get('/instructor/dashboard', isAuthenticated, isInstructor, async (req, res) => {
    res.send(`Welcom Instructor $(req.session.user.full_name `);
});

// TODO: Show students enrolled in a specific course
// 1. Verify instructor owns the course
// 2. Fetch enrolled students
app.get('/instructor/course/:id', isAuthenticated, isInstructor, async (req, res) => {

});


// TODO: Implement manual student addition
// 1. Check if student exists
// 2. Check if already enrolled
// 3. Check Credit Limit (If exceeded, allow but show WARNING)
// 4. Insert into Registrations
app.post('/instructor/add-student', isAuthenticated, isInstructor, async (req, res) => {

});


// TODO: Implement student removal
// 1. Delete from Registrations
app.post('/instructor/remove-student', isAuthenticated, isInstructor, async (req, res) => {

});


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
