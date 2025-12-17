require("dotenv").config();
const mongoose = require("mongoose");
const Dish = require("./models/dish.js");

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const dishes = await Dish.find({});
    console.log("🍽️ All Dishes from MongoDB:");
    console.log(dishes);
    mongoose.disconnect();
  })
  .catch((err) => {
    console.error("❌ Database connection error:", err.message);
  });
