const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
app.use(express.json());

// JWT Secret key
const JWT_SECRET = 'mysecretkey123';

// In-memory user data
const users = [{ email: 'nisarg@gmail.com', password: '1234' }];
// In-memory product data
const products = [];

// Swagger setup
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'File Upload & Product API',
      version: '1.0.0',
      description: 'API for uploading, listing, retrieving, and deleting files, and managing products with JWT authentication'
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    servers: [{ url: 'http://localhost:3000' }]
  },
  apis: ['./index.js'] // Path to the API docs
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Create 'uploads' directory if not present
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token.' });
    req.user = user;
    next();
  });
}

/**
 * @swagger
 * /auth:
 *   post:
 *     summary: Authenticate user and return a JWT token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: JWT token
 *       401:
 *         description: Unauthorized
 */
app.post('/auth', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.password === password);

  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

  const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

/**
 * @swagger
 * /upload:
 *   post:
 *     summary: Upload a file (Authenticated)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *       401:
 *         description: Unauthorized
 */
app.post('/upload', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const fileUrl = `http://localhost:3000/files/${req.file.filename}`;
  res.json({
    message: 'File uploaded successfully!',
    fileUrl,
    fileDetails: { originalName: req.file.originalname, storedName: req.file.filename, size: req.file.size }
  });
});

/**
 * @swagger
 * /files:
 *   get:
 *     summary: List all files
 *     responses:
 *       200:
 *         description: List of files
 */
app.get('/files', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Unable to list files.' });
    res.json({ files });
  });
});

/**
 * @swagger
 * /files/{filename}:
 *   get:
 *     summary: Retrieve a file by filename
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File retrieved
 *       400:
 *         description: File does not exist
 */
app.get('/files/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) return res.status(400).json({ error: 'File does not exist.' });
    res.sendFile(filePath);
  });
});

/**
 * @swagger
 * /delete/{filename}:
 *   delete:
 *     summary: Delete a file by filename (Authenticated)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File deleted
 *       400:
 *         description: File not found
 *       401:
 *         description: Unauthorized
 */
app.delete('/delete/:filename', authenticateToken, (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) return res.status(400).json({ error: 'File does not exist.' });

    fs.unlink(filePath, (err) => {
      if (err) return res.status(500).json({ error: 'Error deleting file.' });
      res.json({ message: 'File deleted successfully.' });
    });
  });
});

/**
 * @swagger
 * /product:
 *   post:
 *     summary: Create a new product (Authenticated)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Product created
 *       401:
 *         description: Unauthorized
 */
app.post('/product', authenticateToken, (req, res) => {
  const { name, price, description } = req.body;

  // Create a new product object
  const newProduct = {
    id: products.length + 1, // Simple auto-increment ID
    name,
    price,
    description,
  };

  products.push(newProduct); // Store the product in memory
  res.status(201).json({ message: 'Product created successfully!', product: newProduct });
});

// Start the server
app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});
