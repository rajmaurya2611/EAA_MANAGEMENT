import React, { useState } from 'react';
import { Button, Input, Switch, Upload, Form, message, Progress, Modal } from 'antd';
import { UploadOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { storage, db } from '../../firebaseConfig'; // Import storage and db from firebaseConfig
import { ref as dbRef, push, set } from 'firebase/database';
import { ref as storageRef, getDownloadURL, uploadBytesResumable } from 'firebase/storage';

const { Dragger } = Upload;

const Template2: React.FC = () => {
  const [imageUrl, setImageUrl] = useState<string>(''); // Image URL to store
  const [description, setDescription] = useState<string>(''); // HTML Description
  const [heading, setHeading] = useState<string>(''); // Heading
  const [rank, setRank] = useState<number>(3); // Default rank
  const [isActive, setIsActive] = useState<boolean>(true); // Active status
  const [loading, setLoading] = useState<boolean>(false);
  const [formSubmitted, setFormSubmitted] = useState<boolean>(false); // Submission flag
  const [progress, setProgress] = useState<number>(0); // Upload progress
  const [, setUploadTask] = useState<any>(null); // Track upload task (not used further)
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

    upload.on('state_changed', (snapshot) => {
      const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      setProgress(prog);
    }, () => {
      message.error('Failed to upload image');
      setLoading(false);
    }, async () => {
      // On successful upload, get download URL
      const downloadURL = await getDownloadURL(upload.snapshot.ref);
      setImageUrl(downloadURL);
      message.success('Image uploaded successfully!');

      // Capture date and time immediately after successful image upload
      const current = new Date();
      setUploadDate(current.toLocaleDateString());
      setUploadTime(current.toLocaleTimeString());
      setLoading(false);
    });
  };

  // Handle image deletion
  const handleDeleteImage = () => {
    setImageUrl('');
    setProgress(0);
  };

  // (Optional) URL validation function – remove if not needed
  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Handle Done button click
  const handleDone = async () => {
    if (!imageUrl) {
      message.error('Please upload an image before submitting.');
      return;
    }
    if (!heading) {
      message.error('Please enter a heading.');
      return;
    }
    if (!description) {
      message.error('Please enter a description.');
      return;
    }

    // (If you needed to validate a link, you could do it here; Template2 does not use a link now)

    // Ensure that uploadDate and uploadTime are set
    // (They should have been set during image upload; if not, capture them now)
    const current = new Date();
    const dateStr = uploadDate || current.toLocaleDateString();
    const timeStr = uploadTime || current.toLocaleTimeString();

    const carouselRef = dbRef(db, 'version12/Carousel');
    const newItemRef = push(carouselRef);

    const itemData = {
      image: imageUrl,
      description,  // HTML description content
      heading,      // Heading text
      isActive,
      rank,
      type: 'indirect', // Fixed type for Template2
      date: dateStr,
      time: timeStr,
    };

    try {
      await set(newItemRef, itemData);
      setShowSuccessModal(true);
      // Reset the form after successful submission
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
    setRank(3);
    setIsActive(true);
    setDescription('');
    setHeading('');
    setUploadDate('');
    setUploadTime('');
  };

  return (
    <div>
      <h2>Template 2: Create Carousel Item</h2>

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
              style={{ maxWidth: '100%', maxHeight: '600px', marginBottom: '20px' }}
            />
            <Button icon={<CloseCircleOutlined />} onClick={handleDeleteImage} type="link" danger>
              Delete Image
            </Button>
          </div>
        )}

        {/* Image URL (Read-Only) */}
        {imageUrl && (
          <Form.Item label="Image URL">
            <Input value={imageUrl} placeholder="Image URL will appear here" disabled />
          </Form.Item>
        )}

        {/* Description */}
        <Form.Item
          label="Description"
          name="description"
          rules={[{ required: true, message: 'Please enter a description' }]}
        >
          <Input.TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter a description"
            rows={4}
          />
        </Form.Item>

        {/* Heading */}
        <Form.Item
          label="Heading"
          name="heading"
          rules={[{ required: true, message: 'Please enter a heading' }]}
        >
          <Input
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            placeholder="Enter a heading"
          />
        </Form.Item>

        {/* Rank */}
        <Form.Item label="Rank" name="rank" rules={[{ required: true, message: 'Please enter rank' }]}>
          <Input
            type="number"
            value={rank}
            onChange={(e) => setRank(Number(e.target.value))}
            placeholder="Enter Rank"
          />
        </Form.Item>

        {/* Is Active */}
        <Form.Item label="Is Active" name="isActive">
          <Switch checked={isActive} onChange={setIsActive} />
        </Form.Item>

        {/* Done and Cancel Buttons */}
        <Form.Item>
          <Button
            type="primary"
            onClick={handleDone}
            disabled={!imageUrl || !rank || !description || !heading || formSubmitted}
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

export default Template2;
