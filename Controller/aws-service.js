const AWS = require("aws-sdk");

// Configure the AWS SDK with your credentials and region
AWS.config.update({
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
  region: process.env.REGION, // e.g., 'us-west-2'
});

// Create an S3 instance
const s3 = new AWS.S3();

const uploadBufferToS3 = async (buffer, key) => {
  const params = {
    Bucket: process.env.BUCKET_NAME, // Your S3 bucket name
    Key: key, // The name you want to save the file as in S3
    Body: buffer, // The buffer you want to upload
  };
  return new Promise((resolve, reject) => {
    s3.upload(params, (err, data) => {
      if (err) {
        console.error("Error uploading buffer to S3:", err);
        return reject(err); // Reject the promise with the error
      }
      // console.log(`Buffer uploaded successfully at ${data.Location}`); // Noisy log
      resolve(data); // Resolve the promise with the data
    });
  });
};

// Example usage
const downloadBufferFromS3 = async (key) => {
  const params = {
    Bucket: process.env.BUCKET_NAME,
    Key: key,
  };
  const data = await s3.getObject(params).promise();
  return data.Body; // returns a Buffer
};

const generatePresignedUrl = (key, expiresIn = 3600) => {
  if (!key) return "";
  const params = {
    Bucket: process.env.BUCKET_NAME, // Your S3 bucket name
    Key: key, // The name of the file in S3
    Expires: expiresIn, // Time in seconds until the URL expires (default: 1 hour)
  };

  return s3.getSignedUrl("getObject", params);
};

// Example usage
// downloadBufferFromS3("your-bucket-name", "test-buffer.txt", (err, buffer) => {
//   if (err) {
//     console.error("Failed to download buffer:", err);
//   } else {
//     console.log("Buffer content:", buffer.toString()); // Convert buffer to string for display
//   }
// });

module.exports = {
  uploadBufferToS3,
  downloadBufferFromS3,
  generatePresignedUrl,
};
