import React, { useState } from 'react';
import { Button, Input, Form, message, Modal } from 'antd';
import { db } from '../../firebaseConfig'; // Ensure your firebaseConfig exports db correctly
import { ref as dbRef, push, set } from 'firebase/database';

const FirstYearNotes: React.FC = () => {
  const [form] = Form.useForm();
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

  // Handle form submission (create note)
  const onFinish = async (values: any) => {
    // Validate that a PDF link was provided
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

    // Prepare the data to be saved
    const noteData = {
      by: 'admin',
      date: dateStr,
      dislikes: 0,
      likes: 0,
      id: noteId,
      pdf: values.pdf,         // PDF link provided by the user
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
        {/* Subject Code */}
        <Form.Item
          label="Subject Code"
          name="sub_code"
          rules={[{ required: true, message: 'Please enter subject code' }]}
        >
          <Input placeholder="Enter subject code" />
        </Form.Item>
        {/* Subject Name */}
        <Form.Item
          label="Subject Name"
          name="sub_name"
          rules={[{ required: true, message: 'Please enter subject name' }]}
        >
          <Input placeholder="Enter subject name" />
        </Form.Item>
        {/* PDF Link Input */}
        <Form.Item
          label="PDF Link"
          name="pdf"
          rules={[{ required: true, message: 'Please enter the PDF link' }]}
        >
          <Input placeholder="Enter PDF link" />
        </Form.Item>
        {/* Submit and Cancel Buttons */}
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
