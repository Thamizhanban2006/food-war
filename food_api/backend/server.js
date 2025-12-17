// server.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");

// Local imports
const connectDB = require("./config/db");
const dishRoutes = require("./routes/dishRoutes");
const setupSocket = require("./socket");

// Initialize app
const app = express();
app.use(cors());
app.use(express.json());

// Connect database
connectDB();

// REST API routes
app.use("/dishes", dishRoutes);

// Create HTTP server for Socket.io
const server = http.createServer(app);

// Setup WebSocket server
setupSocket(server);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
