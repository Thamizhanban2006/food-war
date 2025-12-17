const mongoose = require("mongoose");

const dishSchema = new mongoose.Schema({
  name: { type: String, required: true },
  imageUrl: { type: String, required: true },
  ingredients: [{ type: String, required: true }],
});

// ✅ Prevent OverwriteModelError
const Dish = mongoose.models.Dish || mongoose.model("Dish", dishSchema);

module.exports = Dish;
