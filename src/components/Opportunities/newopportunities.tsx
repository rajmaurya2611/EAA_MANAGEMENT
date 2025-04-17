// ✅ Updated NewOpportunities.tsx
// Includes: createdDate + createdTime fields in dd/mm/yyyy format, stored unencrypted

import React, { useState } from 'react';
import {
  Layout, Form, Input, Button, message, Modal, Select, Switch, Upload, Image,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { db, storage } from '../../firebaseConfig';
import { push, ref as dbRef, set } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import CryptoJS from 'crypto-js';
import dayjs from 'dayjs';

const { Content } = Layout;
const { Option } = Select;

const OPPORTUNITIES_AES_SECRET_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

const encryptAES = (plainText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(OPPORTUNITIES_AES_SECRET_KEY);
    const encrypted = CryptoJS.AES.encrypt(plainText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return encrypted.toString();
  } catch (error) {
    console.error('Encryption failed:', error);
    return plainText;
  }
};

const NewOpportunities: React.FC = () => {
  const [form] = Form.useForm();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>('');

  const onFinish = async (values: any) => {
    const {
      title, companyName, jobProfile, salary, description, location,
      applyLink, applyByDate, type, isRemote, isVisible,
    } = values;

    if (!title || !companyName || !jobProfile || !salary || !description || !location || !applyLink || !applyByDate || !type || !logoUrl) {
      message.error('Please fill all required fields.');
      return;
    }

    const opportunityRef = push(dbRef(db, 'version12/Placement/Opportunities'));
    const id = opportunityRef.key;

    const createdDate = dayjs().format("DD/MM/YYYY");
    const createdTime = dayjs().format("HH:mm:ss");

    const encryptedData = {
      id,
      title: encryptAES(title),
      companyName: encryptAES(companyName),
      jobProfile: encryptAES(jobProfile),
      salary: encryptAES(salary),
      description: encryptAES(description),
      location: encryptAES(location),
      applyLink: encryptAES(applyLink),
      applyByDate: encryptAES(applyByDate),
      type: encryptAES(type),
      logoUrl: encryptAES(logoUrl),
      isRemote: encryptAES(String(isRemote ?? false)),
      isVisible: encryptAES(String(isVisible ?? true)),
      createdDate,     // Not encrypted
      createdTime,     // Not encrypted
    };

    try {
      await set(opportunityRef, encryptedData);
      message.success('Opportunity added successfully!');
      form.resetFields();
      setLogoUrl('');
      setShowSuccessModal(true);
    } catch (err) {
      console.error(err);
      message.error('Failed to add opportunity.');
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    const storagePath = `opportunity_logos/${Date.now()}_${file.name}`;
    const logoRef = storageRef(storage, storagePath);

    try {
      await uploadBytes(logoRef, file);
      const url = await getDownloadURL(logoRef);
      setLogoUrl(url);
      message.success('Logo uploaded successfully');
    } catch (error) {
      console.error(error);
      message.error('Logo upload failed');
    } finally {
      setUploading(false);
    }

    return false;
  };

  return (
    <Layout style={{ minHeight: '80vh' }}>
      <Content style={{ padding: 24, background: '#fff' }}>
        <h2 className="text-xl font-bold mb-4">Add New Opportunity</h2>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ isRemote: true, isVisible: true }}
        >
          <Form.Item label="Title" name="title" rules={[{ required: true }]}>
            <Input placeholder="e.g. Android Developer Intern" />
          </Form.Item>

          <Form.Item label="Company Name" name="companyName" rules={[{ required: true }]}>
            <Input placeholder="e.g. Techify Pvt Ltd" />
          </Form.Item>

          <Form.Item label="Job Profile" name="jobProfile" rules={[{ required: true }]}>
            <Input placeholder="e.g. Android Developer" />
          </Form.Item>

          <Form.Item label="Salary" name="salary" rules={[{ required: true }]}>
            <Input placeholder="e.g. ₹10,000/month" />
          </Form.Item>

          <Form.Item label="Description" name="description" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="Describe the job role..." />
          </Form.Item>

          <Form.Item label="Location" name="location" rules={[{ required: true }]}>
            <Input placeholder="e.g. Remote / Bengaluru" />
          </Form.Item>

          <Form.Item label="Apply Link" name="applyLink" rules={[{ required: true }]}>
            <Input placeholder="e.g. https://company.com/careers" />
          </Form.Item>

          <Form.Item label="Apply By Date" name="applyByDate" rules={[{ required: true }]}>
            <Input placeholder="e.g. 01-12-2025" />
          </Form.Item>

          <Form.Item label="Type" name="type" rules={[{ required: true }]}>
            <Select placeholder="Select type">
              <Option value="Internship">Internship</Option>
              <Option value="Job">Job</Option>
            </Select>
          </Form.Item>

          <Form.Item label="Logo Upload" required>
            <Upload
              beforeUpload={handleUpload}
              showUploadList={false}
              accept="image/*"
            >
              <Button icon={<UploadOutlined />} loading={uploading}>Upload Logo</Button>
            </Upload>
            {logoUrl && (
              <div className="mt-2">
                <span className="text-xs text-gray-500">Preview:</span><br />
                <Image width={100} src={logoUrl} alt="Logo Preview" />
              </div>
            )}
          </Form.Item>

          <Form.Item label="Is Remote?" name="isRemote" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item label="Is Visible?" name="isVisible" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit">Add Opportunity</Button>
          </Form.Item>
        </Form>

        <Modal
          open={showSuccessModal}
          title="Success"
          onCancel={() => setShowSuccessModal(false)}
          footer={[
            <Button key="ok" type="primary" onClick={() => setShowSuccessModal(false)}>OK</Button>,
          ]}
        >
          <p>New opportunity has been added successfully!</p>
        </Modal>
      </Content>
    </Layout>
  );
};

export default NewOpportunities;
