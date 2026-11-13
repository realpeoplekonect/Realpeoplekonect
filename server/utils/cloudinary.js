const cloudinary = require("cloudinary").v2;

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.error("CLOUDINARY CONFIGURATION ERROR:", {
    cloudNamePresent: Boolean(cloudName),
    apiKeyPresent: Boolean(apiKey),
    apiSecretPresent: Boolean(apiSecret)
  });
} else {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });

  console.log("Cloudinary configuration loaded successfully.");
}

module.exports = cloudinary;


// const cloudinary = require("cloudinary").v2;
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET
// });
// module.exports = cloudinary;








