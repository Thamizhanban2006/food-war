const fs = require('fs');
const path = require('path');

console.log('Current working directory:', process.cwd());
console.log('__dirname:', __dirname);

// Check if the models directory exists
const modelsDir = path.join(__dirname, 'models');
console.log('Models directory path:', modelsDir);
console.log('Models directory exists:', fs.existsSync(modelsDir));

// Check if the Dish.js file exists
const dishFile = path.join(__dirname, 'models', 'Dish.js');
console.log('Dish.js file path:', dishFile);
console.log('Dish.js file exists:', fs.existsSync(dishFile));

// List contents of models directory
if (fs.existsSync(modelsDir)) {
  console.log('Contents of models directory:', fs.readdirSync(modelsDir));
}