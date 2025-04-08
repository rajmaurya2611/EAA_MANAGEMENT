import React, { useEffect, useState } from 'react';
import {
  Select,
  Button,
  Table,
  message,
  Spin,
  Modal,
  Form,
  Input,
  Popconfirm,
} from 'antd';
import { DeleteOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, update, remove, get } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Option } = Select;

const ROADMAPS_AES_SECRET_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

const decryptAES = (encryptedText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(ROADMAPS_AES_SECRET_KEY);
    const decrypted = CryptoJS.AES.decrypt(encryptedText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Decryption failed:', error);
    return encryptedText;
  }
};

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

const ManageRoadmap: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedContentType, setSelectedContentType] = useState<string>('ALL');
  const [categories, setCategories] = useState<string[]>([]);
  const [roadmaps, setRoadmaps] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRoadmap, setEditingRoadmap] = useState<any>(null);
  const [editForm] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    const roadmapRef = dbRef(db, 'version12/Placement/Roadmaps');
    onValue(roadmapRef, (snapshot) => {
      const data = snapshot.val();
      setCategories(data ? Object.keys(data) : []);
    });
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      fetchRoadmaps();
    }
  }, [selectedCategory, selectedContentType]);

  const fetchRoadmaps = () => {
    if (!selectedCategory) return;
    setLoading(true);
    const roadmapRef = dbRef(db, `version12/Placement/Roadmaps/${selectedCategory}`);
    onValue(roadmapRef, (snapshot) => {
      const data = snapshot.val();
      const roadmapList = data
        ? Object.values(data).map((item: any) => ({
            key: item.id,
            id: item.id,
            by: decryptAES(item.by),
            content: decryptAES(item.content),
            contentType: item.contentType,
            date: item.date,
            dislikes: item.dislikes,
            likes: item.likes,
            sub_code: decryptAES(item.sub_code),
            sub_name: decryptAES(item.sub_name),
          }))
        : [];
      setRoadmaps(roadmapList);
      setLoading(false);
    });
  };

  // Option 1: Delay modal opening until data is ready and form is populated.
  const handleEdit = async (record: any) => {
    setEditLoading(true);
    const path = `version12/Placement/Roadmaps/${selectedCategory}/${record.id}`;
    try {
      const snapshot = await get(dbRef(db, path));
      const data = snapshot.val();
      if (!data) {
        message.error('Failed to load roadmap for editing.');
        return;
      }
      
      const decryptedRecord = {
        sub_name: decryptAES(data.sub_name),
        sub_code: decryptAES(data.sub_code),
        contentType: data.contentType,
        content: decryptAES(data.content),
        by: decryptAES(data.by),
        likes: data.likes,
        dislikes: data.dislikes,
      };

      // Set the decrypted form values.
      editForm.setFieldsValue(decryptedRecord);
      // Save the ID needed for update action.
      setEditingRoadmap({ id: data.id });
      // Now open the modal with pre-filled form.
      setEditModalVisible(true);
    } catch (err) {
      console.error(err);
      message.error('Error fetching roadmap data.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleUpdate = async () => {
    try {
      const values = await editForm.validateFields();
      const path = `version12/Placement/Roadmaps/${selectedCategory}/${editingRoadmap.id}`;
      const updatedData = {
        id: editingRoadmap.id,
        date: new Date().toLocaleDateString(),
        by: encryptAES(values.by),
        content: encryptAES(values.content),
        contentType: values.contentType,
        dislikes: Number(values.dislikes),
        likes: Number(values.likes),
        sub_code: encryptAES(values.sub_code),
        sub_name: encryptAES(values.sub_name),
      };
      await update(dbRef(db, path), updatedData);
      message.success('Roadmap updated successfully');
      setEditModalVisible(false);
      fetchRoadmaps();
    } catch (err) {
      message.error('Failed to update roadmap');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(dbRef(db, `version12/Placement/Roadmaps/${selectedCategory}/${id}`));
      message.success('Roadmap deleted successfully');
      fetchRoadmaps();
    } catch (err) {
      message.error('Failed to delete roadmap');
    }
  };

  const filteredRoadmaps = roadmaps.filter((r) => {
    const s = searchText.toLowerCase();
    const contentTypeMatch = selectedContentType === 'ALL' || r.contentType === selectedContentType;
    return contentTypeMatch && (
      r.sub_name.toLowerCase().includes(s) ||
      r.sub_code.toLowerCase().includes(s) ||
      r.by.toLowerCase().includes(s)
    );
  });

  const columns = [
    { title: 'Subject Name', dataIndex: 'sub_name', key: 'sub_name' },
    { title: 'Subject Code', dataIndex: 'sub_code', key: 'sub_code' },
    {
      title: 'Content',
      dataIndex: 'content',
      key: 'content',
      render: (text: string, record: any) =>
        record.contentType === 'PDF' ? (
          <a href={text} target="_blank" rel="noopener noreferrer">Open</a>
        ) : (
          <span className="text-xs">HTML Content</span>
        ),
    },
    { title: 'By', dataIndex: 'by', key: 'by' },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Likes', dataIndex: 'likes', key: 'likes' },
    { title: 'Dislikes', dataIndex: 'dislikes', key: 'dislikes' },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: any) => (
        <div className="flex gap-2">
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)}>Edit</Button>
          <Popconfirm
            title="Confirm delete?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button danger icon={<DeleteOutlined />}>Delete</Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 bg-white min-h-[80vh]">
      <h2 className="text-xl font-bold mb-4">Manage Roadmaps</h2>

      <div className="flex flex-wrap gap-4 mb-4 justify-between">
        <div className="flex gap-4 items-center">
          <Select
            placeholder="Select Category"
            style={{ width: 200 }}
            value={selectedCategory || undefined}
            onChange={(val) => {
              setSelectedCategory(val);
              setRoadmaps([]);
            }}
          >
            {categories.map((cat) => (
              <Option key={cat} value={cat}>{cat}</Option>
            ))}
          </Select>

          <Select
            value={selectedContentType}
            onChange={(val) => setSelectedContentType(val)}
            style={{ width: 120 }}
          >
            <Option value="ALL">All</Option>
            <Option value="PDF">PDF</Option>
            <Option value="HTML">HTML</Option>
          </Select>
        </div>

        <Input
          placeholder="Search Subject / Code / By"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 300 }}
        />
      </div>

      <div className="mb-4 text-sm text-gray-700 flex justify-between items-center">
        <div>
          <strong>Selected Filters:</strong> Category: {selectedCategory || 'None'} | Content Type: {selectedContentType}
        </div>
        <div>
          <strong>Total:</strong> {filteredRoadmaps.length}
        </div>
      </div>

      <Spin spinning={loading}>
        <Table columns={columns} dataSource={filteredRoadmaps} pagination={{ pageSize: 8 }} />
      </Spin>

      <Modal
        title="Edit Roadmap"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        onOk={handleUpdate}
        okText="Save"
        destroyOnClose
      >
        <Spin spinning={editLoading}>
          <Form form={editForm} layout="vertical">
            <Form.Item label="Subject Name" name="sub_name" rules={[{ required: true, message: 'Subject Name is required' }]}>
              <Input />
            </Form.Item>
            <Form.Item label="Subject Code" name="sub_code" rules={[{ required: true, message: 'Subject Code is required' }]}>
              <Input />
            </Form.Item>
            <Form.Item label="Content Type" name="contentType" rules={[{ required: true, message: 'Content Type is required' }]}>
              <Select>
                <Option value="PDF">PDF</Option>
                <Option value="HTML">HTML</Option>
              </Select>
            </Form.Item>
            <Form.Item label="Content" name="content" rules={[{ required: true, message: 'Content is required' }]}>
              <Input.TextArea rows={4} />
            </Form.Item>
            <Form.Item label="By" name="by" rules={[{ required: true, message: 'By field is required' }]}>
              <Input />
            </Form.Item>
            <Form.Item label="Likes" name="likes" rules={[{ required: true, message: 'Likes is required' }]}>
              <Input type="number" />
            </Form.Item>
            <Form.Item label="Dislikes" name="dislikes" rules={[{ required: true, message: 'Dislikes is required' }]}>
              <Input type="number" />
            </Form.Item>
          </Form>
        </Spin>
      </Modal>
    </div>
  );
};

export default ManageRoadmap;
