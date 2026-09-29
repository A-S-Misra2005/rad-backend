require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// NEW: Import Agora Token Builder
const { RtcTokenBuilder, RtcRole } = require('agora-access-token'); 

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
  ownerName: String, contactNo: String, address: String, village: String,
  postOffice: String, dist: String, animalNo: String, breed: String,
  sex: String, dob: String, vaxDate: String, vaxName: String,
  vaxMfg: String, vaxExp: String, vaxDose: String, vaxRoute: String,
  vaxNextDate: String, vaxAdverse: String, vaxDoneBy: String,
  imageUrl: String, timestamp: { type: Number, default: Date.now }
});
const Animal = mongoose.model('Animal', animalSchema);

// Helper for Cloudinary Deletion
const getCloudinaryPublicId = (imageUrl) => {
    if (!imageUrl) return null;
    const parts = imageUrl.split('/upload/');
    if (parts.length !== 2) return null;
    const pathWithoutVersion = parts[1].substring(parts[1].indexOf('/') + 1);
    return pathWithoutVersion.substring(0, pathWithoutVersion.lastIndexOf('.'));
};

// --- 5. API ENDPOINTS ---

// NEW ENDPOINT: Generate Agora Token for Video Calls
app.get('/api/agora/token', (req, res) => {
    const channelName = req.query.channelName;
    if (!channelName) {
        return res.status(400).json({ error: 'channelName is required' });
    }

    // Your App ID from MainActivity.kt
    const appId = '48f1d2b3ef384f22abb38fc5b6785b57'; 
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appCertificate) {
        return res.status(500).json({ error: 'Agora App Certificate is missing in .env' });
    }

    // Role Publisher since both Field Worker and Doctor stream video
    const role = RtcRole.PUBLISHER; 
    const uid = 0; // Matches uid = 0 in Android app
    const expirationTimeInSeconds = 3600; // Token valid for 1 hour
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    try {
        const token = RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, channelName, uid, role, privilegeExpiredTs);
        return res.json({ token: token });
    } catch (err) {
        console.error('Error generating Agora token:', err);
        return res.status(500).json({ error: 'Failed to generate token' });
    }
});

// CREATE: Upload Image and Save Data 
app.post('/api/animals', upload.single('image'), async (req, res) => {
  try {
    let imageUrl = '';
    if (req.file) {
      const uploadPromise = new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'rad_animals' },
          (error, result) => result ? resolve(result.secure_url) : reject(error)
        );
        streamifier.createReadStream(req.file.buffer).pipe(stream);
      });
      imageUrl = await uploadPromise;
    }
    const savedAnimal = await new Animal({ ...req.body, imageUrl }).save();
    res.status(201).json(savedAnimal);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save record' });
  }
});

// READ: Get All Records
app.get('/api/animals', async (req, res) => {
  try {
    const animals = await Animal.find().sort({ timestamp: -1 });
    res.status(200).json(animals);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// DELETE: Remove a Record and Cloudinary Image
app.delete('/api/animals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const animalRecord = await Animal.findById(id);
    if (!animalRecord) return res.status(404).json({ message: 'Record not found' });

    if (animalRecord.imageUrl) {
        const publicId = getCloudinaryPublicId(animalRecord.imageUrl);
        if (publicId) await cloudinary.uploader.destroy(publicId);
    }
    await Animal.findByIdAndDelete(id);
    res.status(200).json({ message: 'Record deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

// 6. Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 RAD Server running on port ${PORT}`));