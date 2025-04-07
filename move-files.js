/**
 * Script to move HTML files to public directory
 */
const fs = require('fs');
const path = require('path');

// Array of HTML files to move
const htmlFiles = [
  'index.html',
  'about-us.html',
  'team.html',
  'contact.html',
  'donate.html',
  'donation-success.html',
  'passover.html',
  'passover-registration-success.html',
  'admin-registrations.html'
];

// Create directories if they don't exist
const publicDir = path.join(__dirname, 'public');
const htmlDir = path.join(publicDir, 'html');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
  console.log('Created public directory');
}

if (!fs.existsSync(htmlDir)) {
  fs.mkdirSync(htmlDir);
  console.log('Created public/html directory');
}

// Move HTML files
htmlFiles.forEach(file => {
  const srcPath = path.join(__dirname, file);
  const destPath = path.join(publicDir, file);
  
  if (fs.existsSync(srcPath)) {
    // Copy the file to the destination
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} to public directory`);
    
    // Keep the original files for now
    // fs.unlinkSync(srcPath);
    // console.log(`Deleted original ${file}`);
  } else {
    console.log(`File ${file} not found, skipping`);
  }
});

// Move image files
const imageFiles = [
  'icon.avif',
  'cityscape.avif'
];

const imagesDir = path.join(publicDir, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir);
  console.log('Created public/images directory');
}

imageFiles.forEach(file => {
  const srcPath = path.join(__dirname, file);
  const destPath = path.join(imagesDir, file);
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} to public/images directory`);
    // Also copy to the public root for backward compatibility
    const publicRootPath = path.join(publicDir, file);
    fs.copyFileSync(srcPath, publicRootPath);
    console.log(`Copied ${file} to public directory root for compatibility`);
  } else {
    console.log(`File ${file} not found, skipping`);
  }
});

console.log('File migration completed successfully'); 