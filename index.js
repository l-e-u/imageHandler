require('dotenv').config();

const fs = require("fs");
const path = require("path");
const getPixels = require("get-pixels");
const { extractColors } = require("extract-colors");

// folder that contain the images
const DIRECTORY = process.env.DIRECTORY;
// token is valid for 1 month, refer to imgur.com for a new one if it expires
const IMGUR_TOKEN = process.env.IMGUR_TOKEN;
const API_URL = process.env.API_URL;

// extract the colors that make up the image
function getPalette(filePath) {
   return new Promise((resolve, reject) => {
      getPixels(filePath, (error, pixels) => {
         if (error) return console.log(error);

         const data = [...pixels.data];
         const width = Math.round(Math.sqrt(data.length / 4));
         const height = width;

         extractColors({ data, width, height })
            .then(resolve)
            .catch(error => {
               console.log(error);
               reject(error)
            });
      });
   });
};

// upload the image to imgur
async function uploadImage(imagePath) {
   const imageData = fs.readFileSync(imagePath).toString('base64');

   const response = await fetch('https://api.imgur.com/3/image', {
      method: "POST",
      headers: {
         Authorization: `Bearer ${IMGUR_TOKEN}`,
         "Content-Type": "application/json"
      },
      body: JSON.stringify({ image: imageData })
   });

   // all the properties needed are in result.data
   const json = await response.json();

   return json;
};

async function saveToDatabase(document) {
   const response = await fetch(`${API_URL}/images`, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document)
   });

   const json = await response.json();

   if (!response.ok) {
      console.log('Error from MongoDB:', json);
   };

   return json;
};

async function fileHandler(file) {
   const filePath = `${DIRECTORY}/${file}`;
   const extname = file.slice(-4);

   // create the new file name without the extention
   const filename = file.slice(0, -4).split('_');

   // rename the file
   filename.splice(0, 2, 'pokemon');

   const isBack = filename[6] === 'b';

   // I only want pictures of the front of the pokemon
   if (isBack) {
      return false;
   }

   // store the props that are needed
   const response = await uploadImage(filePath);

   // check to make sure the image was updated
   if (!response.success) {
      console.error('Error from Imgur:', response);
      return true;
   };

   const { deletehash, height, id, size, width, link } = response.data;

   // extract color palette
   const colorPalette = await getPalette(filePath);

   // create the document for the database
   const uploadedImage = await saveToDatabase({
      file: filename.join('_'),
      height,
      size,
      width,
      extname,
      url: link,
      imgur: {
         id,
         deleteHash: deletehash
      },
      colorPalette
   });

   console.log('Uploaded:', uploadedImage);

   return false;
};

async function getImageFilesAndUpload() {
   let index = 0;

   // get only the file names of .png
   const files = fs.readdirSync(DIRECTORY).filter(file => path.extname(file) === ".png");

   async function uploadNextFile() {
      if (index < files.length) {
         console.log('Uploading current index:', index);

         const error = await fileHandler(files[index]);

         // stop if there's an error
         if (error) {
            console.error(error);
            return;
         };

         index++;

         // Schedule the next upload after 1.5 mins
         setTimeout(uploadNextFile, 72000);
      } else {
         console.log('All files uploaded.');
      }
   }

   // Start the upload process
   uploadNextFile();
}

getImageFilesAndUpload();