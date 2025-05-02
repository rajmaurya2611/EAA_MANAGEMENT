import React, { useState } from 'react';
import {
  Button,
  Input,
  Switch,
  Upload,
  Form,
  message,
  Progress,
  Modal,
} from 'antd';
import { UploadOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { storage, db } from '../../firebaseConfig';
import { ref as dbRef, push, set } from 'firebase/database';
import {
  ref as storageRef,
  getDownloadURL,
  uploadBytesResumable,
} from 'firebase/storage';

const { Dragger } = Upload;

const Template2: React.FC = () => {
  const [form] = Form.useForm();
  const [imageUrl, setImageUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadDate, setUploadDate] = useState<string>('');
  const [uploadTime, setUploadTime] = useState<string>('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Image upload
  const handleImageUpload = (file: File) => {
    const valid = file.type === 'image/jpeg' || file.type === 'image/png';
    if (!valid) {
      message.error('Only JPEG/PNG allowed');
      return false;
    }
    setLoading(true);
    const path = `carousels/${file.name}_${Date.now()}`;
    const ref = storageRef(storage, path);
    const task = uploadBytesResumable(ref, file);

    task.on(
      'state_changed',
      snap => setProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      () => {
        message.error('Upload failed');
        setLoading(false);
      },
      async () => {
        const url = await getDownloadURL(ref);
        setImageUrl(url);
        const now = new Date();
        setUploadDate(now.toLocaleDateString());
        setUploadTime(now.toLocaleTimeString());
        setLoading(false);
        message.success('Image uploaded');
      }
    );
    return false; // prevent default
  };

  // Submit
  const handleDone = async () => {
    try {
      const values = await form.validateFields();
      if (!imageUrl) {
        message.error('Please upload an image first');
        return;
      }
      const { description, heading, rank, isActive } = values;
      const dateStr = uploadDate || new Date().toLocaleDateString();
      const timeStr = uploadTime || new Date().toLocaleTimeString();

      const carouselRef = dbRef(db, 'version12/Carousel');
      const newRef = push(carouselRef);

      await set(newRef, {
        image: imageUrl,
        description,
        head: heading,
        rank,
        isActive,
        type: 'indirect',
        date: dateStr,
        time: timeStr,
      });

      setShowSuccessModal(true);
      setTimeout(() => {
        form.resetFields();
        setImageUrl('');
        setProgress(0);
        setUploadDate('');
        setUploadTime('');
      }, 500);
    } catch {
      // validation errors shown by Form
    }
  };

  return (
    <div>
      <h2>Template 2: Create Carousel Item</h2>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ isActive: true }}
      >
        {/* Image Upload */}
        <Form.Item label="Image Upload">
          <Dragger beforeUpload={handleImageUpload} showUploadList={false}>
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p>Click or drag file to upload</p>
          </Dragger>
        </Form.Item>

        {loading && (
          <Progress percent={progress} style={{ marginBottom: 16 }} />
        )}

        {imageUrl && (
          <div style={{ marginBottom: 16 }}>
            <img
              src={imageUrl}
              alt="Uploaded"
              style={{ maxWidth: '100%', marginBottom: 8 }}
            />
            <Button
              icon={<CloseCircleOutlined />}
              danger
              onClick={() => {
                setImageUrl('');
                setProgress(0);
              }}
            >
              Delete Image
            </Button>
          </div>
        )}

        {/* Description */}
        <Form.Item
          name="description"
          label="Description"
          rules={[{ required: true, message: 'Please enter a description' }]}
        >
          <Input.TextArea placeholder="Enter HTML description" rows={4} />
        </Form.Item>

        {/* Heading */}
        <Form.Item
          name="heading"
          label="Heading"
          rules={[{ required: true, message: 'Please enter a heading' }]}
        >
          <Input placeholder="Enter heading text" />
        </Form.Item>

        {/* Rank (starts blank) */}
        <Form.Item
          name="rank"
          label="Rank"
          rules={[{ required: true, message: 'Please enter rank' }]}
        >
          <Input type="number" placeholder="Enter Rank" />
        </Form.Item>

        {/* Is Active */}
        <Form.Item
          name="isActive"
          label="Is Active"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        {/* Buttons */}
        <Form.Item>
          <Button type="primary" onClick={handleDone}>
            Done
          </Button>{' '}
          <Button onClick={() => form.resetFields()}>Cancel</Button>
        </Form.Item>
      </Form>

      {/* Success Modal */}
      <Modal
        open={showSuccessModal}
        title="Success"
        onOk={() => setShowSuccessModal(false)}
        footer={[
          <Button
            key="ok"
            type="primary"
            onClick={() => setShowSuccessModal(false)}
          >
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
