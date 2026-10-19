import React, { useState } from 'react';
import { db } from '../../firebaseConfig';
import { ref as dbRef, push, set } from 'firebase/database';
import { Button, Form, Input, message, Modal } from 'antd';
import CryptoJS from 'crypto-js';
import dayjs from 'dayjs';

const INFOCARDS_AES_SECRET_KEY = import.meta.env.VITE_AES_SECRET_KEY;

// Encryption function for text fields
const encryptAES = (plainText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(INFOCARDS_AES_SECRET_KEY);
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

interface InfoCardData {
  head: string;
  body: string;
  bg: string;
  rank: number;  // Rank is now a plain integer, not encrypted
  date: string;
  time: string;
}

const NewInfoCard: React.FC = () => {
  const [form] = Form.useForm();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalTitle, setModalTitle] = useState('');

  const onFinish = async (values: any) => {
    const { head, body, bg, rank } = values;

    if (!head || !body || !bg || !rank) {
      message.error('Please fill in all the fields.');
      return;
    }

    const currentDate = dayjs().format('DD/MM/YYYY');
    const currentTime = dayjs().format('HH:mm A');

    const encryptedHead = encryptAES(head);
    const encryptedBody = encryptAES(body);
    const encryptedBg = encryptAES(bg);

    const newCard: InfoCardData = {
      head: encryptedHead,
      body: encryptedBody,
      bg: encryptedBg,
      rank: Number(rank), // Not encrypted, saved as integer
      date: currentDate,
      time: currentTime,
    };

    const newCardRef = push(dbRef(db, 'version12/infoCards'));

    try {
      await set(newCardRef, newCard);
      setModalTitle('Success');
      setModalMessage('Info card added successfully!');
      setIsModalVisible(true);
      form.resetFields();
    } catch (error) {
      setModalTitle('Error');
      setModalMessage('Failed to add info card.');
      setIsModalVisible(true);
    }
  };

  const handleOk = () => setIsModalVisible(false);
  const handleCancel = () => setIsModalVisible(false);

  return (
    <div style={{ margin: '20px' }}>
      <h2>Add Info Card</h2>
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          label="Heading"
          name="head"
          rules={[{ required: true, message: 'Please enter a heading' }]}
        >
          <Input placeholder="Enter heading" />
        </Form.Item>

        <Form.Item
          label="Body"
          name="body"
          rules={[{ required: true, message: 'Please enter the body content' }]}
        >
          <Input.TextArea placeholder="Enter body content" />
        </Form.Item>

        <Form.Item
          label="Background Color"
          name="bg"
          rules={[{ required: true, message: 'Please enter the background color' }]}
        >
          <Input placeholder="Enter background color" />
        </Form.Item>

        <Form.Item
          label="Rank"
          name="rank"
          rules={[{ required: true, message: 'Please enter a rank' }]}
        >
          <Input type="number" placeholder="Enter rank (number only)" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit">
            Add Info Card
          </Button>
        </Form.Item>
      </Form>

      <Modal
        title={modalTitle}
        visible={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="OK"
      >
        <p>{modalMessage}</p>
      </Modal>
    </div>
  );
};

export default NewInfoCard;
