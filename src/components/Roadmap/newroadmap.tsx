import React, { useEffect, useState } from 'react';
import { Layout, Menu, Spin, Button, Modal, Form, Input, Select, message } from 'antd';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, push, set } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Sider, Content } = Layout;
const { Option } = Select;

const ROADMAPS_AES_SECRET_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

// ✅ Your original encryption logic
const encryptAES = (plainText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(ROADMAPS_AES_SECRET_KEY);
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

interface RoadmapCategory {
  category: string;
  roadmaps: { [id: string]: any };
}

const NewRoadmap: React.FC = () => {
  const [categories, setCategories] = useState<RoadmapCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [modalStep, setModalStep] = useState<number>(1);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [categoryForm] = Form.useForm();
  const [roadmapModalForm] = Form.useForm();
  const [roadmapForm] = Form.useForm();
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false); // ✅ Success modal

  useEffect(() => {
    const roadmapRef = dbRef(db, 'version12/Placement/Roadmaps');
    const unsubscribe = onValue(roadmapRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const catList: RoadmapCategory[] = Object.keys(data).map((cat) => ({
          category: cat,
          roadmaps: data[cat],
        }));
        setCategories(catList);
        if (catList.length > 0 && !selectedCategory) {
          setSelectedCategory(catList[0].category);
        }
      } else {
        setCategories([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [selectedCategory]);

  const handleMenuClick = ({ key }: { key: string }) => setSelectedCategory(key);

  const onFinishStep1 = (values: any) => {
    const catName = values.categoryName.trim();
    if (!catName) {
      message.error('Please enter a valid category name.');
      return;
    }
    if (categories.some((c) => c.category === catName)) {
      message.error('Category already exists.');
      return;
    }
    setNewCategoryName(catName);
    setModalStep(2);
  };

  const addRoadmap = async (values: any, targetCategory: string) => {
    const { contentType, content, sub_code, sub_name, by } = values;
    if (!content || !sub_code || !sub_name || !by || !contentType) {
      message.error('Please fill all required fields.');
      return;
    }

    const now = new Date().toLocaleDateString();
    const roadmapRef = push(dbRef(db, `version12/Placement/Roadmaps/${targetCategory}`));
    const roadmapId = roadmapRef.key;

    const roadmapData = {
      id: roadmapId,
      by: encryptAES(by),
      content: encryptAES(content),
      contentType,
      date: now,
      dislikes: 0,
      likes: 0,
      sub_code: encryptAES(sub_code),
      sub_name: encryptAES(sub_name),
    };

    try {
      await set(roadmapRef, roadmapData);
      message.success('Roadmap added successfully!');
      roadmapForm.resetFields();
      roadmapModalForm.resetFields();
      setModalStep(1);
      setShowAddModal(false);
      setShowSuccessModal(true); // ✅ Show success modal
      if (!categories.find((c) => c.category === targetCategory)) {
        setSelectedCategory(targetCategory);
      }
    } catch (err) {
      console.error(err);
      message.error('Failed to add roadmap.');
    }
  };

  const onFinishStep2 = (values: any) => addRoadmap(values, newCategoryName);
  const onFinishRoadmap = (values: any) => addRoadmap(values, selectedCategory);
  const handleCancelModal = () => {
    setModalStep(1);
    setShowAddModal(false);
    categoryForm.resetFields();
    roadmapModalForm.resetFields();
  };

  return (
    <>
      <Layout style={{ minHeight: '70vh' }}>
        <Sider width={250} style={{ background: '#fff' }}>
          <Spin spinning={loading} style={{ margin: '20px' }}>
            <Menu
              mode="inline"
              selectedKeys={[selectedCategory]}
              onClick={handleMenuClick}
              style={{ height: 'calc(100% - 50px)', borderRight: 0 }}
            >
              {categories.map((cat) => (
                <Menu.Item key={cat.category}>{cat.category}</Menu.Item>
              ))}
            </Menu>
            <Button
              type="dashed"
              style={{ width: '90%', margin: '10px' }}
              onClick={() => {
                setModalStep(1);
                setShowAddModal(true);
              }}
            >
              Add Roadmap
            </Button>
          </Spin>
        </Sider>

        <Layout style={{ padding: '24px' }}>
          <Content style={{ background: '#fff', padding: 24 }}>
            <h2>Add Roadmap to {selectedCategory}</h2>
            <Form
              form={roadmapForm}
              layout="vertical"
              onFinish={onFinishRoadmap}
              initialValues={{ by: 'Admin', contentType: 'PDF' }}
            >
              <Form.Item label="By" name="by" rules={[{ required: true }]}>
                <Input placeholder="Author name" />
              </Form.Item>
              <Form.Item label="Content Type" name="contentType" rules={[{ required: true }]}>
                <Select>
                  <Option value="PDF">PDF</Option>
                  <Option value="HTML">HTML</Option>
                </Select>
              </Form.Item>
              <Form.Item label="Content" name="content" rules={[{ required: true }]}>
                <Input.TextArea placeholder="PDF link or raw HTML content" rows={5} />
              </Form.Item>
              <Form.Item label="Subject Code" name="sub_code" rules={[{ required: true }]}>
                <Input placeholder="e.g. KAS-1234" />
              </Form.Item>
              <Form.Item label="Subject Name" name="sub_name" rules={[{ required: true }]}>
                <Input placeholder="Roadmap Title" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit">Add Roadmap</Button>
              </Form.Item>
            </Form>
          </Content>
        </Layout>

        {/* Modal for adding a new category and roadmap */}
        <Modal
          open={showAddModal}
          title="Add New Roadmap"
          onCancel={handleCancelModal}
          footer={null}
        >
          {modalStep === 1 && (
            <Form form={categoryForm} layout="vertical" onFinish={onFinishStep1}>
              <Form.Item
                label="New Category (e.g. Java)"
                name="categoryName"
                rules={[{ required: true, message: 'Please enter category name' }]}
              >
                <Input placeholder="Enter new category name" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit">Next</Button>
              </Form.Item>
            </Form>
          )}
          {modalStep === 2 && (
            <Form
              form={roadmapModalForm}
              layout="vertical"
              onFinish={onFinishStep2}
              initialValues={{ by: 'Admin', contentType: 'PDF' }}
            >
              <Form.Item label="By" name="by" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label="Content Type" name="contentType" rules={[{ required: true }]}>
                <Select>
                  <Option value="PDF">PDF</Option>
                  <Option value="HTML">HTML</Option>
                </Select>
              </Form.Item>
              <Form.Item label="Content" name="content" rules={[{ required: true }]}>
                <Input.TextArea placeholder="PDF link or raw HTML content" rows={5} />
              </Form.Item>
              <Form.Item label="Subject Code" name="sub_code" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label="Subject Name" name="sub_name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit">Add Roadmap</Button>
              </Form.Item>
            </Form>
          )}
        </Modal>

        {/* ✅ Success Modal */}
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
          <p>Your roadmap has been added successfully!</p>
        </Modal>
      </Layout>
    </>
  );
};

export default NewRoadmap;
