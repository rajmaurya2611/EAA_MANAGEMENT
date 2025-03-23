import React, { useState } from 'react';
import { Button, Input, Switch, Upload, Form, message, Progress, Modal } from 'antd';
import { UploadOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { storage, db } from '../../firebaseConfig'; // Import storage and db from firebaseConfig
import { ref as dbRef, push, set } from 'firebase/database';
import { ref as storageRef, getDownloadURL, uploadBytesResumable } from 'firebase/storage';

const { Dragger } = Upload;

const Template1: React.FC = () => {
  const [imageUrl, setImageUrl] = useState<string>(''); // Image URL to store
  const [rank, setRank] = useState<number>(1); // Default rank
  const [isActive, setIsActive] = useState<boolean>(true); // Default is active
  const [link, setLink] = useState<string>(''); // Store the link entered by the user
  const [loading, setLoading] = useState<boolean>(false);
  const [formSubmitted, setFormSubmitted] = useState<boolean>(false); // Flag for form submission
  const [progress, setProgress] = useState<number>(0); // Track upload progress
  const [, setUploadTask] = useState<any>(null); // To track the upload task
  const [uploadDate, setUploadDate] = useState<string>(''); // Date when image is uploaded
  const [uploadTime, setUploadTime] = useState<string>(''); // Time when image is uploaded
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false); // Toggle success modal
  const [form] = Form.useForm(); // Ant Design Form instance

  // Handle image upload with MIME type enforcement and progress bar
  const handleImageUpload = async (file: any) => {
    // Validate file type (JPEG or PNG)
    const isValidImage = file.type === 'image/jpeg' || file.type === 'image/png';
    if (!isValidImage) {
      message.error('You can only upload JPEG or PNG images!');
      return false;
    }
    setLoading(true);

    // Create a reference to Firebase Storage
    const storagePath = storageRef(storage, `carousels/${file.name}`);
    const metadata = { contentType: file.type };

    // Create an upload task with progress monitoring
    const upload = uploadBytesResumable(storagePath, file, metadata);
    setUploadTask(upload);

    upload.on(
      'state_changed',
      (snapshot) => {
        const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setProgress(prog);
      },
      () => {
        message.error('Failed to upload image');
        setLoading(false);
      },
      async () => {
        // On successful upload, get the download URL
        const downloadURL = await getDownloadURL(upload.snapshot.ref);
        setImageUrl(downloadURL);

        // Immediately capture the date and time after upload
        const current = new Date();
        setUploadDate(current.toLocaleDateString());
        setUploadTime(current.toLocaleTimeString());

        message.success('Image uploaded successfully!');
        setLoading(false);
      }
    );
  };

  // Handle image deletion
  const handleDeleteImage = () => {
    setImageUrl('');
    setProgress(0);
  };

  // Validate the URL
  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch (_) {
      return false;
    }
  };

  // Handle Done button click
  const handleDone = async () => {
    if (!imageUrl) {
      message.error('Please upload an image before submitting.');
      return;
    }
    if (!isValidUrl(link)) {
      message.error('Please enter a valid URL.');
      return;
    }

    const carouselRef = dbRef(db, 'version12/Carousel');
    const newItemRef = push(carouselRef);

    // Build the data object using the captured date and time
    const itemData = {
      image: imageUrl,
      isActive,
      link,
      rank,
      type: 'direct',
      date: uploadDate,
      time: uploadTime,
    };

    try {
      await set(newItemRef, itemData);
      setShowSuccessModal(true);

      setTimeout(() => {
        form.resetFields();
        setImageUrl('');
        setProgress(0);
        setFormSubmitted(false);
      }, 1000);
    } catch (error) {
      message.error('Failed to save item');
    }
  };

  // Handle Cancel button click (reset the form)
  const handleCancel = () => {
    form.resetFields();
    setImageUrl('');
    setProgress(0);
    setLink('');
    setRank(1);
    setIsActive(true);
    setUploadDate('');
    setUploadTime('');
  };

  return (
    <div>
      <h2>Template 1: Create Carousel Item</h2>

      <Form form={form} layout="vertical">
        {/* Image Upload */}
        <Form.Item label="Image Upload">
          <Dragger
            beforeUpload={(file) => {
              handleImageUpload(file);
              return false;
            }}
            showUploadList={false}
            disabled={formSubmitted}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">Click or drag file to upload</p>
          </Dragger>
        </Form.Item>

        {/* Progress Bar */}
        {loading && <Progress percent={progress} />}

        {/* Uploaded Image */}
        {imageUrl && (
          <div>
            <img
              src={imageUrl}
              alt="Uploaded"
              style={{ maxWidth: '50%', maxHeight: '600px', marginBottom: '20px' }}
            />
            <Button icon={<CloseCircleOutlined />} onClick={handleDeleteImage} type="link" danger>
              Delete Image
            </Button>
          </div>
        )}

        {/* Image URL Field */}
        {imageUrl && (
          <Form.Item label="Image URL">
            <Input value={imageUrl} placeholder="Image URL will appear here" disabled />
          </Form.Item>
        )}

        {/* Rank Input */}
        <Form.Item label="Rank" name="rank" rules={[{ required: true, message: 'Please enter rank' }]}>
          <Input
            type="number"
            value={rank}
            onChange={(e) => setRank(Number(e.target.value))}
            placeholder="Enter Rank"
          />
        </Form.Item>

        {/* Is Active Toggle */}
        <Form.Item label="Is Active" name="isActive">
          <Switch checked={isActive} onChange={setIsActive} />
        </Form.Item>

        {/* Link Input */}
        <Form.Item label="Link" name="link" rules={[{ required: true, message: 'Please enter a link' }]}>
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Enter a link" />
        </Form.Item>

        {/* Done and Cancel Buttons */}
        <Form.Item>
          <Button
            type="primary"
            onClick={handleDone}
            disabled={!imageUrl || !rank || !link || formSubmitted}
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
        open={showSuccessModal}
        title="Success"
        onOk={() => setShowSuccessModal(false)}
        onCancel={() => setShowSuccessModal(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setShowSuccessModal(false)}>
            OK
          </Button>,
        ]}
      >
        <p>Your item has been saved successfully!</p>
      </Modal>
    </div>
  );
};

export default Template1;
