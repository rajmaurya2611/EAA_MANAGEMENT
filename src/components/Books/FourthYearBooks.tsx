import React, { useState, useEffect } from 'react';
import { Layout, Menu, Spin, Button, Modal, Form, Input, message } from 'antd';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, push, set } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Sider, Content } = Layout;

// Get your secret key from environment variables
const BOOKS_AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY;

// Encryption function for text fields
const encryptAES = (plainText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(BOOKS_AES_SECRET_KEY);
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

interface BranchBooks {
  branch: string;
  books: { [noteId: string]: any };
}

const FourthYearBooks: React.FC = () => {
  const [branches, setBranches] = useState<BranchBooks[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  // Modal state for adding a new branch/subject note (two-step modal)
  const [showAddSubjectModal, setShowAddSubjectModal] = useState<boolean>(false);
  const [modalStep, setModalStep] = useState<number>(1); // 1: Branch name, 2: Subject details for new branch addition
  const [newBranchName, setNewBranchName] = useState<string>('');
  const [branchForm] = Form.useForm();
  const [subjectModalForm] = Form.useForm();
  // Subject note form in content area (always visible)
  const [subjectForm] = Form.useForm();
  // Success modal for subject note addition from content area
  const [showSubjectSuccessModal, setShowSubjectSuccessModal] = useState<boolean>(false);

  // Listen for branches at the specified path
  useEffect(() => {
    const booksRef = dbRef(db, 'version12/Materials/Books/Fourth_Year');
    const unsubscribe = onValue(booksRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const branchList: BranchBooks[] = Object.keys(data).map((branch) => ({
          branch,
          books: data[branch],
        }));
        setBranches(branchList);
        if (branchList.length > 0 && !selectedBranch) {
          setSelectedBranch(branchList[0].branch);
        }
      } else {
        setBranches([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [selectedBranch]);

  const handleMenuClick = ({ key }: { key: string }) => {
    setSelectedBranch(key);
  };

  // --- Two-Step Modal for Adding a New Branch & Subject Note ---
  // Step 1: Enter Branch Name
  const onFinishStep1 = (values: any) => {
    const branchName = values.branchName.trim();
    if (!branchName) {
      message.error('Please enter a valid branch name.');
      return;
    }
    setNewBranchName(branchName);
    // Proceed to step 2
    setModalStep(2);
  };

  // Step 2: Enter Subject Details for the new branch (including "By")
  const onFinishStep2 = async (values: any) => {
    const { pdf, sub_code, sub_name, by } = values;
    if (!pdf || !sub_code || !sub_name || !by) {
      message.error('Please fill all the required fields.');
      return;
    }
    const current = new Date();
    const dateStr = current.toLocaleDateString();
    // Encrypt the fields before saving
    const encryptedPdf = encryptAES(pdf);
    const encryptedSubCode = encryptAES(sub_code);
    const encryptedSubName = encryptAES(sub_name);
    const encryptedBy = encryptAES(by);
    // The path for the new subject will be: version12/Materials/Books/Fourth_Year/<newBranchName>
    const branchPath = `version12/Materials/Books/Fourth_Year/${newBranchName}`;
    const newSubjectRef = push(dbRef(db, branchPath));
    const newSubjectId = newSubjectRef.key;
    const subjectData = {
      by: encryptedBy,
      date: dateStr,
      dislikes: 0,
      likes: 0,
      id: newSubjectId,
      pdf: encryptedPdf,
      sub_code: encryptedSubCode,
      sub_name: encryptedSubName,
    };

    try {
      await set(newSubjectRef, subjectData);
      message.success('Subject added successfully under new branch!');
      // Optionally, set the newly created branch as selected:
      setSelectedBranch(newBranchName);
      // Reset the modal
      setTimeout(() => {
        branchForm.resetFields();
        subjectModalForm.resetFields();
        setModalStep(1);
        setShowAddSubjectModal(false);
      }, 1000);
    } catch (error) {
      message.error('Failed to add subject');
    }
  };

  const handleModalCancel = () => {
    setShowAddSubjectModal(false);
    setModalStep(1);
    branchForm.resetFields();
    subjectModalForm.resetFields();
  };

  // --- Subject Note Form in Content Area (Always Visible) ---
  const onFinishSubject = async (values: any) => {
    if (!selectedBranch) {
      message.error('No branch selected.');
      return;
    }
    const { pdf, sub_code, sub_name, by } = values;
    if (!pdf || !sub_code || !sub_name || !by) {
      message.error('Please fill in all fields.');
      return;
    }
    const current = new Date();
    const dateStr = current.toLocaleDateString();
    // Encrypt the fields before saving
    const encryptedPdf = encryptAES(pdf);
    const encryptedSubCode = encryptAES(sub_code);
    const encryptedSubName = encryptAES(sub_name);
    const encryptedBy = encryptAES(by);
    const branchPath = `version12/Materials/Books/Fourth_Year/${selectedBranch}`;
    const newNoteRef = push(dbRef(db, branchPath));
    const newNoteId = newNoteRef.key;
    const noteData = {
      by: encryptedBy,
      date: dateStr,
      dislikes: 0,
      likes: 0,
      id: newNoteId,
      pdf: encryptedPdf,
      sub_code: encryptedSubCode,
      sub_name: encryptedSubName,
    };

    try {
      await set(newNoteRef, noteData);
      message.success('Subject note added successfully!');
      setShowSubjectSuccessModal(true);
      setTimeout(() => {
        subjectForm.resetFields();
        setShowSubjectSuccessModal(false);
      }, 1000);
    } catch (error) {
      message.error('Failed to add subject note.');
    }
  };

  const onSubjectCancel = () => {
    subjectForm.resetFields();
  };

  return (
    <Layout style={{ minHeight: '70vh' }}>
      <Sider width={250} style={{ background: '#fff', paddingBottom: '24px' }}>
        {/* Sidebar code remains unchanged */}
        {/* For brevity, assume the sidebar remains the same as in your current code */}
        <Spin spinning={loading} style={{ margin: '20px' }}>
          <Menu
            mode="inline"
            selectedKeys={[selectedBranch]}
            onClick={handleMenuClick}
            style={{ height: 'calc(100% - 50px)', borderRight: 0 }}
          >
            {branches.map((branchObj) => (
              <Menu.Item key={branchObj.branch}>{branchObj.branch}</Menu.Item>
            ))}
          </Menu>
          <Button
            type="dashed"
            style={{ width: '90%', margin: '10px' }}
            onClick={() => {
              setShowAddSubjectModal(true);
              setModalStep(1);
            }}
          >
            Add Subject
          </Button>
        </Spin>
      </Sider>
      <Layout style={{ padding: '24px' }}>
        <Content style={{ background: '#fff', padding: 24, minHeight: 280 }}>
          <h2>Add Subject Note to {selectedBranch}</h2>
          <Form
            form={subjectForm}
            layout="vertical"
            onFinish={onFinishSubject}
            initialValues={{ by: 'Admin' }}
          >
            <Form.Item
              label="By"
              name="by"
              rules={[{ required: true, message: 'Please enter the author name' }]}
            >
              <Input placeholder="Enter author name" />
            </Form.Item>
            <Form.Item
              label="PDF Link"
              name="pdf"
              rules={[{ required: true, message: 'Please enter the PDF link' }]}
            >
              <Input placeholder="Enter PDF link" />
            </Form.Item>
            <Form.Item
              label="Subject Code"
              name="sub_code"
              rules={[{ required: true, message: 'Please enter the subject code' }]}
            >
              <Input placeholder="Enter subject code" />
            </Form.Item>
            <Form.Item
              label="Subject Name"
              name="sub_name"
              rules={[{ required: true, message: 'Please enter the subject name' }]}
            >
              <Input placeholder="Enter subject name" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">
                Add Subject Note
              </Button>
              <Button onClick={onSubjectCancel} style={{ marginLeft: '10px' }}>
                Cancel
              </Button>
            </Form.Item>
          </Form>
        </Content>
      </Layout>

      {/* Two-Step Modal for adding a new branch & subject details */}
      <Modal
        open={showAddSubjectModal}
        title="Add New Subject"
        onCancel={handleModalCancel}
        footer={null}
      >
        {modalStep === 1 && (
          <Form form={branchForm} layout="vertical" onFinish={onFinishStep1}>
            <Form.Item
              label="Branch Name"
              name="branchName"
              rules={[{ required: true, message: 'Please enter the branch name' }]}
            >
              <Input placeholder="Enter branch name" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">
                Next
              </Button>
            </Form.Item>
          </Form>
        )}
        {modalStep === 2 && (
          <Form form={subjectModalForm} layout="vertical" onFinish={onFinishStep2} initialValues={{ by: 'Admin' }}>
            <Form.Item
              label="By"
              name="by"
              rules={[{ required: true, message: 'Please enter the author name' }]}
            >
              <Input placeholder="Enter author name" />
            </Form.Item>
            <Form.Item
              label="PDF Link"
              name="pdf"
              rules={[{ required: true, message: 'Please enter the PDF link' }]}
            >
              <Input placeholder="Enter PDF link" />
            </Form.Item>
            <Form.Item
              label="Subject Code"
              name="sub_code"
              rules={[{ required: true, message: 'Please enter the subject code' }]}
            >
              <Input placeholder="Enter subject code" />
            </Form.Item>
            <Form.Item
              label="Subject Name"
              name="sub_name"
              rules={[{ required: true, message: 'Please enter the subject name' }]}
            >
              <Input placeholder="Enter subject name" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">
                Add Subject
              </Button>
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* Success Modal for Subject Note Addition */}
      <Modal
        open={showSubjectSuccessModal}
        title="Success"
        onOk={() => setShowSubjectSuccessModal(false)}
        onCancel={() => setShowSubjectSuccessModal(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setShowSubjectSuccessModal(false)}>
            OK
          </Button>,
        ]}
      >
        <p>Your subject note has been added successfully!</p>
      </Modal>
    </Layout>
  );
};

export default FourthYearBooks;
