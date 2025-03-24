import React, { useState } from 'react';
import { Button, Input, Form, message, Modal } from 'antd';
import { db } from '../../firebaseConfig'; // Ensure your firebaseConfig exports db correctly
import { ref as dbRef, push, set } from 'firebase/database';
import CryptoJS from 'crypto-js';

const NOTES_AES_SECRET_KEY = import.meta.env.VITE_NOTES_AES_SECRET_KEY; // Your secret key

// Encryption function for PDF link
const encryptAES = (plainText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(NOTES_AES_SECRET_KEY);
    const encrypted = CryptoJS.AES.encrypt(plainText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return encrypted.toString(); // Returns the ciphertext as a string
  } catch (error) {
    console.error('Encryption failed', error);
    return plainText;
  }
};

const FirstYearNotes: React.FC = () => {
  const [form] = Form.useForm();
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

  // Handle form submission (create note)
  const onFinish = async (values: any) => {
    if (!values.pdf) {
      message.error('Please provide a PDF link.');
      return;
    }

    // Capture current date immediately before submission
    const current = new Date();
    const dateStr = current.toLocaleDateString();

    // Create a new uid by pushing to the specified database path
    const notesRef = dbRef(db, 'version12/Materials/Notes/First_Year/All_Branch');
    const newNoteRef = push(notesRef);
    const noteId = newNoteRef.key; // This will be our note's id

    // Encrypt the PDF link before saving
    const encryptedPdf = encryptAES(values.pdf);

    // Prepare the data to be saved
    const noteData = {
      by: 'admin',
      date: dateStr,
      dislikes: 0,
      likes: 0,
      id: noteId,
      pdf: encryptedPdf,         // Save the encrypted PDF link
      sub_code: values.sub_code, // Subject code input
      sub_name: values.sub_name, // Subject name input
    };

    try {
      await set(newNoteRef, noteData);
      message.success('Note created successfully!');
      setShowSuccessModal(true);
      // Reset form fields after a short delay
      setTimeout(() => {
        form.resetFields();
      }, 1000);
    } catch (error) {
      message.error('Failed to create note');
    }
  };

  // Handle cancel (reset form)
  const onCancel = () => {
    form.resetFields();
  };

  return (
    <div>
      <h2>First Year Notes</h2>
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          label="Subject Code"
          name="sub_code"
          rules={[{ required: true, message: 'Please enter subject code' }]}
        >
          <Input placeholder="Enter subject code" />
        </Form.Item>
        <Form.Item
          label="Subject Name"
          name="sub_name"
          rules={[{ required: true, message: 'Please enter subject name' }]}
        >
          <Input placeholder="Enter subject name" />
        </Form.Item>
        <Form.Item
          label="PDF Link"
          name="pdf"
          rules={[{ required: true, message: 'Please enter the PDF link' }]}
        >
          <Input placeholder="Enter PDF link" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit">
            Create Note
          </Button>
          <Button onClick={onCancel} type="default" style={{ marginLeft: '10px' }}>
            Cancel
          </Button>
        </Form.Item>
      </Form>
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
        <p>Your note has been created successfully!</p>
      </Modal>
    </div>
  );
};

export default FirstYearNotes;
