step 1:
install node.js 
then come to cwd and do:
npm init -y
npm install express ejs pg express-session body-parser dotenv

step 2:
DDL.sql and DATA.sql are already in the directory

step 3:
app.js :contains the backend logic of the application
view/ : contains all the frontend templates 

check: node app.js (server running or not)
to exit : ctrl + c

step 4:
a)implemented isAuthenticated:middleware function that checks if req.session.user exists. If not, redirect to the login page. Apply this middleware to all dashboard and registration routes to prevent unauthorized access
b)

step 5:
1️⃣ Connect to PostgreSQL without specifying a DB

Use the default database (postgres):

psql -U postgres


If prompted, enter your postgres password.

2️⃣ Create the database

Inside psql:

CREATE DATABASE course_reg_db;


You should see:

CREATE DATABASE


Now exit:

\q

3️⃣ Load DDL.sql

Now this will WORK:

psql -U postgres -d course_reg_db -f DDL.sql


Expected output:

CREATE TABLE
CREATE TABLE
CREATE TABLE

4️⃣ Load DATA.sql
psql -U postgres -d course_reg_db -f DATA.sql


Expected:

INSERT 0 X

5️⃣ Verify tables exist
psql -U postgres -d course_reg_db


Then:

\dt


You must see:

 users
 courses
 registrations


Test:

SELECT * FROM users;

\q 


----info----------------------------------------------------------------------------------------
1)req is always the same type of object, but different properties are populated depending on:
HTTP method (GET / POST)
Where the client sends data
Middleware used
2)
Regardless of GET or POST, req always has:
Property	Meaning
req.method	"GET", "POST", etc
req.url	Requested URL
req.headers	HTTP headers
req.params	Route parameters
req.query	Query string parameters
req.body	Request body (if parsed)
req.session	Session data (if middleware used)
3)GET request
Data is sent in the URL
Example: GET /login?username=abc&password=123
Express gives you:req.query.username, req.query.password
req.body is usually empty in GET
4)POST request
Data is sent in the request body
Example (form submit):
<form method="POST" action="/login">
Express gives you:req.body.username, req.body.password
req.query is usually empty
5)
req.body does NOT exist by default
You must have middleware:
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
6)
If you use: app.use(session(...))
Then:
req.session.user : Exists for both GET and POST requests.

