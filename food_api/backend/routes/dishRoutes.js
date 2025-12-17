// routes/dishRoutes.js
const express = require("express");
const Dish = require('../models/dish.js');
const router = express.Router();

// POST /dishes - add a dish
router.post("/", async (req, res) => {
  try {
    const { name, imageUrl, ingredients } = req.body;
    if (!name || !imageUrl || !ingredients?.length)
      return res.status(400).json({ error: "Invalid payload" });

    const dish = new Dish({ name, imageUrl, ingredients });
    await dish.save();
    res.status(201).json(dish);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /dishes/random - random dish
router.get("/random", async (_, res) => {
  try {
    const d = await Dish.aggregate([{ $sample: { size: 1 } }]);
    if (!d.length) return res.status(404).json({ error: "No dishes found" });
    res.json(d[0]);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
