const express = require('express');
const {MongoClient, ObjectId} = require('mongodb');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const saltRounds = 10;

const app = express();
app.use(cors({
    origin: 'http://localhost:3000', // Вказати свій фронтенд-домен
    credentials: true
}));
app.use(express.json());
app.use(session({
    secret: 'your_secret_key', // Змінити на секретний ключ
    resave: false,
    saveUninitialized: true,
    cookie: {secure: false} // Налаштування cookie
}));

let db;
let todosCollection;
let usersCollection;

// Підключення до MongoDB
async function initializeDatabase() {
    try {
        const client = await MongoClient.connect("mongodb+srv://serhiiromanenko13:Poiuyt0987@cluster0.sxyyllo.mongodb.net/", {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        db = client.db('todos');  // Вказуємо ім'я бази даних
        todosCollection = db.collection('todos_collection'); // Отримуємо колекцію для todos
        usersCollection = db.collection('users_collection'); // Отримуємо колекцію для користувачів
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
        process.exit(1); // Завершити програму у разі помилки підключення
    }
}

// Викликати ініціалізацію бази даних і потім запуск сервера
initializeDatabase().then(() => {
    // Маршрут для перевірки
    app.get('/', (req, res) => {
        res.send('API is running...');
    });

    // Реєстрація нового користувача
    app.post('/api/register', async (req, res) => {
        const {username, password, name} = req.body;
        try {
            const passwordHash = await bcrypt.hash(password, saltRounds);
            const result = await usersCollection.insertOne({
                username,
                passwordHash,
                name, // Зберігаємо нове поле "name"
                createdAt: new Date(),
                updatedAt: new Date()
            });
            res.status(201).json({message: 'User registered successfully'});
        } catch (err) {
            res.status(500).json({message: err.message});
        }
    });

    // Авторизація користувача
    app.post('/api/login', async (req, res) => {
        const {username, password} = req.body;
        try {
            const user = await usersCollection.findOne({username});
            if (user && await bcrypt.compare(password, user.passwordHash)) {
                req.session.userId = user._id; // Зберігаємо userId в сесії
                res.json({message: 'Login successful'});
            } else {
                res.status(401).json({message: 'Invalid credentials'});
            }
        } catch (err) {
            res.status(500).json({message: err.message});
        }
    });

    // Отримати інформацію про поточного користувача
    app.get('/api/user', async (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({message: 'Unauthorized'});
        }

        try {
            const user = await usersCollection.findOne({_id: new ObjectId(req.session.userId)}, {projection: {name: 1}});
            if (!user) {
                return res.status(404).json({message: 'User not found'});
            }
            res.json({name: user.name});  // Відправляємо лише поле "name"
        } catch (err) {
            res.status(500).json({message: err.message});
        }
    });

    // Отримати всі todo
    app.get('/api/todos', async (req, res) => {
        console.log('Received request for /api/todos');
        if (!req.session.userId) {
            return res.status(401).json({message: 'Unauthorized'});
        }

        try {
            const todos = await todosCollection.find({userId: req.session.userId}).toArray();
            res.json(todos);
        } catch (err) {
            console.error('Error fetching todos:', err);
            res.status(500).json({message: err.message});
        }
    });

    // Створити новий todo
    app.post('/api/todos', async (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({message: 'Unauthorized'});
        }

        const todo = {
            name: req.body.text,
            completed: false,
            userId: req.session.userId  // Додаємо поле userId, щоб зв'язати todo з користувачем
        };

        try {
            const result = await todosCollection.insertOne(todo);
            const insertedTodo = await todosCollection.findOne({_id: result.insertedId});
            res.status(201).json(insertedTodo);
        } catch (err) {
            res.status(400).json({message: err.message});
        }
    });

    // Оновити todo
    app.put('/api/todos/:id', async (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({message: 'Unauthorized'});
        }

        const {id} = req.params;
        const updateData = {
            $set: {
                name: req.body.text,
                completed: req.body.completed
            }
        };

        try {
            const result = await todosCollection.updateOne({
                _id: new ObjectId(id),
                userId: req.session.userId
            }, updateData);
            if (result.matchedCount === 0) {
                return res.status(404).json({message: 'Todo not found'});
            }
            res.json({message: 'Todo updated'});
        } catch (err) {
            res.status(400).json({message: err.message});
        }
    });

    // Видалити todo
    app.delete('/api/todos/:id', async (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({message: 'Unauthorized'});
        }

        const {id} = req.params;

        try {
            const result = await todosCollection.deleteOne({_id: new ObjectId(id), userId: req.session.userId});
            if (result.deletedCount === 0) {
                return res.status(404).json({message: 'Todo not found'});
            }
            res.json({message: 'Todo deleted'});
        } catch (err) {
            res.status(500).json({message: err.message});
        }
    });

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
