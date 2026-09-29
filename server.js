require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. Configure Multer to hold images in memory temporarily
const upload = multer({ storage: multer.memoryStorage() });

// 3. Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// 4. Define the Database Layout (Schema)
const animalSchema = new mongoose.Schema({
  ownerName: String,
  contactNo: String,
  address: String,
  village: String,
  postOffice: String,
  dist: String,
  animalNo: String,
  breed: String,
  sex: String,
  dob: String,
  vaxDate: String,
  vaxName: String,
  vaxMfg: String,
  vaxExp: String,
  vaxDose: String,
  vaxRoute: String,
  vaxNextDate: String,
  vaxAdverse: String,
  vaxDoneBy: String,
  imageUrl: String,
  timestamp: { type: Number, default: Date.now }
});

const Animal = mongoose.model('Animal', animalSchema);

// --- HELPER FUNCTION FOR CLOUDINARY ---
const getCloudinaryPublicId = (imageUrl) => {
    if (!imageUrl) return null;
    
    // Split the URL at '/upload/'
    const parts = imageUrl.split('/upload/');
    if (parts.length !== 2) return null;

    // Removes the version tag (e.g., 'v1701234567/')
    const pathWithoutVersion = parts[1].substring(parts[1].indexOf('/') + 1);
    
    // Removes the file extension (e.g., '.jpg')
    const publicId = pathWithoutVersion.substring(0, pathWithoutVersion.lastIndexOf('.'));
    
    return publicId;
};

// --- 5. API ENDPOINTS ---

// CREATE: Upload Image and Save Data (Used by Field Worker)
app.post('/api/animals', upload.single('image'), async (req, res) => {
  try {
    let imageUrl = '';

    if (req.file) {
      // Upload the image directly to Cloudinary
      const uploadPromise = new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'rad_animals' },
          (error, result) => {
            if (result) resolve(result.secure_url);
            else reject(error);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(stream);
      });
      imageUrl = await uploadPromise;
    }

    // Save everything to MongoDB
    const newAnimal = new Animal({
      ...req.body,
      imageUrl: imageUrl
    });

    const savedAnimal = await newAnimal.save();
    res.status(201).json(savedAnimal);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save record' });
  }
});

// READ: Get All Records (Used by Admin Dashboard)
app.get('/api/animals', async (req, res) => {
  try {
    const animals = await Animal.find().sort({ timestamp: -1 });
    res.status(200).json(animals);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// DELETE: Remove a Record and its Cloudinary Image (Used by Admin Dashboard)
app.delete('/api/animals/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch the existing record to get the imageUrl
    const animalRecord = await Animal.findById(id);
    if (!animalRecord) {
        return res.status(404).json({ message: 'Record not found in database.' });
    }

    // 2. Check for an image and delete it from Cloudinary
    if (animalRecord.imageUrl) {
        const publicId = getCloudinaryPublicId(animalRecord.imageUrl);
        
        if (publicId) {
            // Destroy the image on Cloudinary
            await cloudinary.uploader.destroy(publicId);
            console.log(`Deleted Cloudinary image: ${publicId}`);
        }
    }

    // 3. Delete the record from MongoDB
    await Animal.findByIdAndDelete(id);

    res.status(200).json({ message: 'Record and associated image successfully deleted' });
  } catch (error) {
    console.error('Error deleting record:', error);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

// 6. Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 RAD Server running on port ${PORT}`));