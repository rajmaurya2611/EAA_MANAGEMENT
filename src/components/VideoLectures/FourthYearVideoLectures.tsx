import React, { useState, useEffect } from 'react';
import { Layout, Menu, Spin, Button, Modal, Form, Input, message } from 'antd';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, push, set } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Sider, Content } = Layout;

// same key as your E-Book component
const LECTURES_AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY;

const encryptAES = (plainText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(LECTURES_AES_SECRET_KEY);
    return CryptoJS.AES.encrypt(plainText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  } catch {
    return plainText;
  }
};

interface BranchLectures {
  branch: string;
  lectures: { [id: string]: any };
}

const FourthYearVideoLectures: React.FC = () => {
  const [branches, setBranches] = useState<BranchLectures[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // two-step modal for new branch + lecture
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [newBranchName, setNewBranchName] = useState('');
  const [branchForm] = Form.useForm();
  const [lectureModalForm] = Form.useForm();

  // in-page lecture form
  const [lectureForm] = Form.useForm();
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // listen for all branches under Lectures → Fourth_Year
  useEffect(() => {
    const lecturesRef = dbRef(db, 'version12/Materials/Lectures/Fourth_Year');
    const unsub = onValue(lecturesRef, snap => {
      const data = snap.val() || {};
      const list = Object.keys(data).map(branch => ({
        branch,
        lectures: data[branch],
      }));
      setBranches(list);
      if (list.length && !selectedBranch) setSelectedBranch(list[0].branch);
      setLoading(false);
    });
    return () => unsub();
  }, [selectedBranch]);

  const handleMenuClick = ({ key }: { key: string }) => {
    setSelectedBranch(key);
  };

  // STEP 1: pick new branch
  const onFinishStep1 = (vals: any) => {
    const name = vals.branchName?.trim();
    if (!name) return message.error('Please enter a valid branch name.');
    setNewBranchName(name);
    setModalStep(2);
  };

  // STEP 2: fill lecture details for new branch
  const onFinishStep2 = async (vals: any) => {
    const { by, pdf, sub_code, sub_name } = vals;
    if (!by || !pdf || !sub_code || !sub_name) {
      return message.error('Please fill all fields.');
    }

    const dateStr = new Date().toLocaleDateString();
    const encrypted = {
      by: encryptAES(by),
      date: dateStr,
      dislikes: 0,
      likes: 0,
      pdf: encryptAES(pdf),
      sub_code: encryptAES(sub_code),
      sub_name: encryptAES(sub_name),
      id: '',  // will set after push
    };

    const path = `version12/Materials/Lectures/Fourth_Year/${newBranchName}`;
    const newRef = push(dbRef(db, path));
    encrypted.id = newRef.key!;

    try {
      await set(newRef, encrypted);
      message.success('Lecture added under new branch!');
      setSelectedBranch(newBranchName);
      setTimeout(() => {
        branchForm.resetFields();
        lectureModalForm.resetFields();
        setModalStep(1);
        setShowAddModal(false);
      }, 800);
    } catch {
      message.error('Failed to add lecture.');
    }
  };

  const handleModalCancel = () => {
    setShowAddModal(false);
    setModalStep(1);
    branchForm.resetFields();
    lectureModalForm.resetFields();
  };

  // in-page form submit for existing branch
  const onFinishLecture = async (vals: any) => {
    if (!selectedBranch) return message.error('No branch selected.');
    const { by, pdf, sub_code, sub_name } = vals;
    if (!by || !pdf || !sub_code || !sub_name) {
      return message.error('Please fill all fields.');
    }

    const dateStr = new Date().toLocaleDateString();
    const encrypted = {
      by: encryptAES(by),
      date: dateStr,
      dislikes: 0,
      likes: 0,
      pdf: encryptAES(pdf),
      sub_code: encryptAES(sub_code),
      sub_name: encryptAES(sub_name),
      id: '',
    };

    const path = `version12/Materials/Lectures/Fourth_Year/${selectedBranch}`;
    const newRef = push(dbRef(db, path));
    encrypted.id = newRef.key!;

    try {
      await set(newRef, encrypted);
      message.success('Lecture added successfully!');
      setShowSuccessModal(true);
      setTimeout(() => {
        lectureForm.resetFields();
        setShowSuccessModal(false);
      }, 800);
    } catch {
      message.error('Failed to add lecture.');
    }
  };

  return (
    <Layout style={{ minHeight: '70vh' }}>
      <Sider width={250} style={{ background: '#fff', paddingBottom: 24 }}>
        <Spin spinning={loading} style={{ margin: 20 }}>
          <Menu
            mode="inline"
            selectedKeys={[selectedBranch]}
            onClick={handleMenuClick}
            style={{ height: 'calc(100% - 50px)', borderRight: 0 }}
          >
            {branches.map(b => (
              <Menu.Item key={b.branch}>{b.branch}</Menu.Item>
            ))}
          </Menu>
          <Button
            type="dashed"
            style={{ width: '90%', margin: 10 }}
            onClick={() => {
              setShowAddModal(true);
              setModalStep(1);
            }}
          >
            Add Lecture
          </Button>
        </Spin>
      </Sider>

      <Layout style={{ padding: 24 }}>
        <Content style={{ background: '#fff', padding: 24, minHeight: 280 }}>
          <h2>Add Lecture to {selectedBranch}</h2>
          <Form
            form={lectureForm}
            layout="vertical"
            onFinish={onFinishLecture}
            initialValues={{ by: 'Admin' }}
          >
            <Form.Item label="By" name="by" rules={[{ required: true }]}>
              <Input placeholder="Enter author name" />
            </Form.Item>
            <Form.Item label="Video Link" name="pdf" rules={[{ required: true }]}>
              <Input placeholder="Enter video URL" />
            </Form.Item>
            <Form.Item label="Channel Name" name="sub_code" rules={[{ required: true }]}>
              <Input placeholder="Enter Channel Name" />
            </Form.Item>
            <Form.Item label="Lecture Name" name="sub_name" rules={[{ required: true }]}>
              <Input placeholder="Enter lecture name" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">Add Lecture</Button>
              <Button onClick={() => lectureForm.resetFields()} style={{ marginLeft: 10 }}>
                Cancel
              </Button>
            </Form.Item>
          </Form>
        </Content>
      </Layout>

      {/* Two-step modal */}
      <Modal
        open={showAddModal}
        title="Add New Lecture"
        onCancel={handleModalCancel}
        footer={null}
      >
        {modalStep === 1 && (
          <Form form={branchForm} layout="vertical" onFinish={onFinishStep1}>
            <Form.Item
              label="Branch Name"
              name="branchName"
              rules={[{ required: true, message: 'Please enter branch name' }]}
            >
              <Input placeholder="Enter branch name" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">Next</Button>
            </Form.Item>
          </Form>
        )}
        {modalStep === 2 && (
          <Form
            form={lectureModalForm}
            layout="vertical"
            onFinish={onFinishStep2}
            initialValues={{ by: 'Admin' }}
          >
            <Form.Item label="By" name="by" rules={[{ required: true }]}>
              <Input placeholder="Enter author name" />
            </Form.Item>
            <Form.Item label="Video Link" name="pdf" rules={[{ required: true }]}>
              <Input placeholder="Enter video URL" />
            </Form.Item>
            <Form.Item label="Channel Name" name="sub_code" rules={[{ required: true }]}>
              <Input placeholder="Enter Channel Name" />
            </Form.Item>
            <Form.Item label="Lecture Name" name="sub_name" rules={[{ required: true }]}>
              <Input placeholder="Enter lecture name" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">Add Lecture</Button>
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* Success modal */}
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
        <p>Your lecture has been added successfully!</p>
      </Modal>
    </Layout>
  );
};

export default FourthYearVideoLectures;
