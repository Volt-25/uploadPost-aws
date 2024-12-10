const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const githubToken = process.env.GITHUB_TOKEN;

app.use(express.json());

const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { files: 3 } });

const postSchema = new mongoose.Schema({
    athlete_id: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Athlete' },
    media_url: String,
    caption: String,
    media_type: { type: String, enum: ['photo', 'video'] },
    created_at: { type: Date, default: Date.now }
}, { collection: 'AthletePosts' });

const AthletePost = mongoose.model('AthletePost', postSchema);

// Modify the uploadFileToGitHub function
async function uploadFileToGitHub(fileName, fileContent, folderName) {
    const accessToken = githubToken;

    if (!accessToken) {
        throw new Error('GitHub token is not defined. Check your environment variables.');
    }

    const repositoryOwner = 'Volt-25';
    const repositoryName = 'cdn';

    const filePath = `${folderName}/${fileName}`;
    const apiUrl = `https://api.github.com/repos/${repositoryOwner}/${repositoryName}/contents/${filePath}`;

    try {
        const response = await axios.put(apiUrl, {
            message: "Uploaded by server",
            content: fileContent.toString('base64'),
            branch: 'main'
        }, {
            headers: {
                Authorization: `token ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.content.download_url;
    } catch (error) {
        console.error('Error uploading file to GitHub:', error.response?.data || error.message);
        throw error;
    }
}

app.post('/api/athletes/:athlete_id/posts', upload.single('media'), async (req, res) => {
    try {
        const { caption } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No media file provided' });
        }

        // Determine the media type
        const mimeType = req.file.mimetype;

        let mediaType = '';
        if (mimeType.startsWith('image/')) {
            mediaType = 'photo';
        } else if (mimeType.startsWith('video/')) {
            mediaType = 'video';
        } else {
            return res.status(400).json({ error: 'Unsupported media type' });
        }

        let mediaBuffer = req.file.buffer;
        if (mediaType === 'photo') {
            mediaBuffer = await sharp(mediaBuffer)
                .resize(1200, 1200, { fit: 'inside' })
                .jpeg({ quality: 80 })
                .toBuffer();
        }

        const uniqueFileName = uuidv4() + '-' + req.file.originalname;
        const mediaUrl = await uploadFileToGitHub(uniqueFileName, mediaBuffer, 'postMedia');

        const newPost = new AthletePost({
            athlete_id: req.params.athlete_id,
            media_url: mediaUrl,
            caption: caption || '',
            media_type: mediaType, // Automatically determined media type
        });

        await newPost.save();

        res.status(201).json({ message: 'Post created successfully', post_id: newPost._id });
    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.json({ message: 'Hello World' });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
