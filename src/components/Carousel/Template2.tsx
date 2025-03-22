import React, { useState } from 'react';
import { Button, Input, Switch, Upload, Form, message, Progress, Modal } from 'antd';
import { UploadOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { storage, db } from '../../firebaseConfig'; // Import storage and db from firebaseConfig
import { ref as dbRef, push, set } from 'firebase/database';
import { ref as storageRef, getDownloadURL, uploadBytesResumable } from 'firebase/storage';

const { Dragger } = Upload;

const Template2: React.FC = () => {
  const [imageUrl, setImageUrl] = useState<string>(''); // Image URL to store
  const [description, setDescription] = useState<string>(''); // HTML Description entered by the user
  const [rank, setRank] = useState<number>(3); // Default rank (fixed value)
  const [isActive, setIsActive] = useState<boolean>(true); // Default is active
  const [link, setLink] = useState<string>(''); // Store the link entered by the user
  const [loading, setLoading] = useState<boolean>(false);
  const [formSubmitted, setFormSubmitted] = useState<boolean>(false); // Flag to check if form is submitted
  const [progress, setProgress] = useState<number>(0); // Track upload progress
  const [, setUploadTask] = useState<any>(null); // To track the upload task
  const [uploadTime, setUploadTime] = useState<string>(''); // Store date and time when Done is clicked
  const [uploadDate, setUploadDate] = useState<string>(''); // Store date
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false); // To toggle success modal visibility
  const [form] = Form.useForm(); // Ant Design Form instance

  // Handle image upload with MIME type enforcement and progress bar
  const handleImageUpload = async (file: any) => {
    // Validate the file type (JPEG or PNG)
    const isValidImage = file.type === 'image/jpeg' || file.type === 'image/png';
    if (!isValidImage) {
      message.error('You can only upload JPEG or PNG images!');
      return false; // Prevent upload if the type is not JPEG or PNG
    }

    setLoading(true);

    // Create a reference to Firebase Storage
    const storagePath = storageRef(storage, `carousels/${file.name}`);
    const metadata = { contentType: file.type }; // Use the same content type for the file

    // Create an upload task with progress monitoring
    const upload = uploadBytesResumable(storagePath, file, metadata);
    setUploadTask(upload);

    // Track upload progress
    upload.on('state_changed', (snapshot) => {
      const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      setProgress(progress); // Update progress state
    }, () => {
      message.error('Failed to upload image');
      setLoading(false);
    }, async () => {
      // On successful upload, get the download URL
      const downloadURL = await getDownloadURL(upload.snapshot.ref);
      setImageUrl(downloadURL); // Set the image URL
      message.success('Image uploaded successfully!');
      setLoading(false);
    });
  };

  // Handle image deletion
  const handleDeleteImage = () => {
    setImageUrl(''); // Clear the image URL
    setProgress(0); // Reset progress
  };

  // Validate the URL
  const isValidUrl = (url: string) => {
    try {
      new URL(url); // This will throw if it's not a valid URL
      return true;
    } catch (_) {
      return false;
    }
  };

  // Handle Done button click
  const handleDone = async () => {
    // Get current date and time when the "Done" button is clicked
    const currentDate = new Date();
    setUploadDate(currentDate.toLocaleDateString()); // Store the current date in the state
    setUploadTime(currentDate.toLocaleTimeString()); // Store the current time in the state

    // Validate the URL entered by the user
    if (!isValidUrl(link)) {
      message.error('Please enter a valid URL.');
      return;
    }

    const carouselRef = dbRef(db, 'version12/Carousel');
    const newItemRef = push(carouselRef); // Create a unique ID for the new item

    // Store the data, including the timestamp
    const itemData = {
      image: imageUrl,
      description, // Add description field (HTML content)
      isActive,
      link, // Use the user-entered link
      rank,
      type: 'indirect', // Fixed type for Template 2
      date: uploadDate, // Add the date field
      time: uploadTime, // Add the time field
    };

    try {
      // Save data to Firebase Realtime Database
      await set(newItemRef, itemData);
      setShowSuccessModal(true); // Show the success modal

      // Reset the form after successful submission
      setTimeout(() => {
        form.resetFields();
        setImageUrl('');
        setProgress(0);
        setFormSubmitted(false); // Reset form submission flag
      }, 1000); // Clear form after 1 second delay
    } catch (error) {
      message.error('Failed to save item');
    }
  };

  // Handle Cancel button click (Reset the form)
  const handleCancel = () => {
    form.resetFields();
    setImageUrl('');
    setProgress(0);
    setLink('');
    setRank(3); // Reset rank to the default value for Template 2
    setIsActive(true);
    setDescription('');
    setUploadDate('');
    setUploadTime('');
  };

  return (
    <div>
      <h2>Template 2: Create Carousel Item</h2>

      <Form form={form} layout="vertical">
        {/* Image upload */}
        <Form.Item label="Image Upload">
          <Dragger
            beforeUpload={(file) => {
              handleImageUpload(file);
              return false; // Prevent automatic upload
            }}
            showUploadList={false}
            disabled={formSubmitted} // Disable upload after form submission
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">Click or drag file to upload</p>
          </Dragger>
        </Form.Item>

        {/* Show progress bar during upload */}
        {loading && <Progress percent={progress} />}

        {/* Show the uploaded image */}
        {imageUrl && (
          <div>
            <img
              src={imageUrl}
              alt="Uploaded"
              style={{ maxWidth: '100%', maxHeight: '600px', marginBottom: '20px' }} // Limit width and height
            />
            <Button icon={<CloseCircleOutlined />} onClick={handleDeleteImage} type="link" danger>
              Delete Image
            </Button>
          </div>
        )}

        {/* Image URL field that gets updated after image upload */}
        {imageUrl && (
          <Form.Item label="Image URL">
            <Input
              value={imageUrl} // Bind image URL to input field
              placeholder="Image URL will appear here"
              disabled // Make the field read-only
            />
          </Form.Item>
        )}

        {/* Description input */}
        <Form.Item label="Description" name="description" rules={[{ required: true, message: 'Please enter a description' }]}>
          <Input.TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter a description"
            rows={4}
          />
        </Form.Item>

        {/* Rank input */}
        <Form.Item label="Rank" name="rank" rules={[{ required: true, message: 'Please enter rank' }]}>
          <Input
            type="number"
            value={rank}
            onChange={(e) => setRank(Number(e.target.value))}
            placeholder="Enter Rank"
          />
        </Form.Item>

        {/* Is Active toggle */}
        <Form.Item label="Is Active" name="isActive">
          <Switch checked={isActive} onChange={setIsActive} />
        </Form.Item>

        {/* Link input (User-provided URL) */}
        <Form.Item label="Link" name="link" rules={[{ required: true, message: 'Please enter a link' }]}>
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Enter a link"
          />
        </Form.Item>

        {/* Done button */}
        <Form.Item>
          <Button
            type="primary"
            onClick={handleDone}
            disabled={!imageUrl || !rank || !link || formSubmitted} // Disable if no image or invalid data
          >
            Done
          </Button>
          <Button onClick={handleCancel} type="default" style={{ marginLeft: '10px' }}>
            Cancel
          </Button>
        </Form.Item>
      </Form>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        title="Success"
        onOk={() => setShowSuccessModal(false)}
        onCancel={() => setShowSuccessModal(false)}
        footer={[<Button key="ok" type="primary" onClick={() => setShowSuccessModal(false)}>OK</Button>]}
      >
        <p>Your item has been saved successfully!</p>
      </Modal>
    </div>
  );
};

export default Template2;
