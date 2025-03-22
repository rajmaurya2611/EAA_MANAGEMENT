import React, { useState } from 'react';
import { Button, Input, Switch, Upload, Form, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { storage, db } from '../../firebaseConfig'; // Import storage and db from firebaseConfig
import { ref as dbRef, push, set } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const { Dragger } = Upload;

const Template1: React.FC = () => {
  const [imageUrl, setImageUrl] = useState<string>(''); // Image URL to store
  const [rank, setRank] = useState<number>(1); // Default rank
  const [isActive, setIsActive] = useState<boolean>(true); // Default is active
  const [link, setLink] = useState<string>(''); // Store the link entered by the user
  const [loading, setLoading] = useState<boolean>(false);
  const [formSubmitted, setFormSubmitted] = useState<boolean>(false); // Flag to check if form is submitted
  const [form] = Form.useForm(); // Ant Design Form instance

  // Handle image upload
  const handleImageUpload = async (file: any) => {
    const storageRefPath = storageRef(storage, `carousels/${file.name}`);
    setLoading(true);

    try {
      // Upload image to Firebase Storage
      await uploadBytes(storageRefPath, file.originFileObj as Blob); // Using the uploaded file
      // Get the download URL after successful upload
      const downloadURL = await getDownloadURL(storageRefPath);
      setImageUrl(downloadURL); // Set the image URL
      message.success('Image uploaded successfully!');
    } catch (error) {
      message.error('Failed to upload image');
    } finally {
      setLoading(false);
    }
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
    // Validate the URL entered by the user
    if (!isValidUrl(link)) {
      message.error('Please enter a valid URL.');
      return;
    }

    const carouselRef = dbRef(db, 'version12/Carousel');
    const newItemRef = push(carouselRef); // Create a unique ID for the new item
    
    // Store the data
    const itemData = {
      image: imageUrl,
      isActive,
      link, // Use the user-entered link
      rank,
      type: 'direct', // Default type is 'direct'
    };
    
    try {
      // Save data to Firebase Realtime Database
      await set(newItemRef, itemData);
      message.success('Item saved successfully!');

      // Reset the form after successful submission
      setTimeout(() => {
        form.resetFields();
        setImageUrl('');
        setFormSubmitted(false); // Reset form submission flag
      }, 1000); // Clear form after 1 second delay
    } catch (error) {
      message.error('Failed to save item');
    }
  };

  return (
    <div>
      <h2>Template 1: Create Carousel Item</h2>

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

        {/* Image URL field that gets updated after image upload */}
        <Form.Item label="Image URL">
          <Input
            value={imageUrl} // Bind image URL to input field
            placeholder="Image URL will appear here"
            disabled // Make the field read-only
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
        </Form.Item>
      </Form>
    </div>
  );
};

export default Template1;
