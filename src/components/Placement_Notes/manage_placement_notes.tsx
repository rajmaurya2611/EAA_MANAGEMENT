import React, { useEffect, useState } from 'react';
import {
  Select, Button, Table, message, Spin, Modal, Form, Input, Popconfirm,
} from 'antd';
import { DeleteOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, update, remove, get } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Option } = Select;

const PLACEMENT_NOTES_AES_SECRET_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

const decryptAES = (encryptedText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(PLACEMENT_NOTES_AES_SECRET_KEY);
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
    const key = CryptoJS.enc.Utf8.parse(PLACEMENT_NOTES_AES_SECRET_KEY);
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

const ManagePlacementNotes: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedContentType, setSelectedContentType] = useState('ALL');
  const [categories, setCategories] = useState<string[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [editForm] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    const notesRef = dbRef(db, 'version12/Placement/Placement_Notes');
    onValue(notesRef, (snapshot) => {
      const data = snapshot.val();
      setCategories(data ? Object.keys(data) : []);
    });
  }, []);

  useEffect(() => {
    if (selectedCategory) fetchNotes();
  }, [selectedCategory, selectedContentType]);

  const fetchNotes = () => {
    setLoading(true);
    const refPath = `version12/Placement/Placement_Notes/${selectedCategory}`;
    const ref = dbRef(db, refPath);

    onValue(ref, (snapshot) => {
      const data = snapshot.val();
      const list = data
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
      setNotes(list);
      setLoading(false);
    });
  };

  const handleEdit = async (record: any) => {
    setEditLoading(true);
    const path = `version12/Placement/Placement_Notes/${selectedCategory}/${record.id}`;
    const snapshot = await get(dbRef(db, path));
    const data = snapshot.val();

    if (!data) {
      message.error('Failed to fetch note.');
      return;
    }

    const decrypted = {
      sub_name: decryptAES(data.sub_name),
      sub_code: decryptAES(data.sub_code),
      contentType: data.contentType,
      content: decryptAES(data.content),
      by: decryptAES(data.by),
      likes: data.likes,
      dislikes: data.dislikes,
    };

    editForm.setFieldsValue(decrypted);
    setEditingNote({ id: data.id });
    setEditModalVisible(true);
    setEditLoading(false);
  };

  const handleUpdate = async () => {
    try {
      const values = await editForm.validateFields();
      const path = `version12/Placement/Placement_Notes/${selectedCategory}/${editingNote.id}`;
      const payload = {
        id: editingNote.id,
        date: new Date().toLocaleDateString(),
        by: encryptAES(values.by),
        content: encryptAES(values.content),
        contentType: values.contentType,
        dislikes: Number(values.dislikes),
        likes: Number(values.likes),
        sub_code: encryptAES(values.sub_code),
        sub_name: encryptAES(values.sub_name),
      };
      await update(dbRef(db, path), payload);
      message.success('Placement Note updated');
      setEditModalVisible(false);
      fetchNotes();
    } catch {
      message.error('Update failed');
    }
  };

  const handleDelete = async (id: string) => {
    await remove(dbRef(db, `version12/Placement/Placement_Notes/${selectedCategory}/${id}`));
    message.success('Deleted successfully');
    fetchNotes();
  };

  const filteredNotes = notes.filter((r) => {
    const s = searchText.toLowerCase();
    const matchType = selectedContentType === 'ALL' || r.contentType === selectedContentType;
    return matchType && (
      r.sub_name.toLowerCase().includes(s) ||
      r.sub_code.toLowerCase().includes(s) ||
      r.by.toLowerCase().includes(s)
    );
  });

  const columns = [
    { title: 'Subject Name', dataIndex: 'sub_name' },
    { title: 'Subject Code', dataIndex: 'sub_code' },
    {
      title: 'Content',
      dataIndex: 'content',
      render: (text: string, record: any) =>
        record.contentType === 'PDF' ? (
          <a href={text} target="_blank" rel="noopener noreferrer">Open</a>
        ) : (
          <span className="text-xs">HTML Content</span>
        ),
    },
    { title: 'By', dataIndex: 'by' },
    { title: 'Date', dataIndex: 'date' },
    { title: 'Likes', dataIndex: 'likes' },
    { title: 'Dislikes', dataIndex: 'dislikes' },
    {
      title: 'Actions',
      render: (_: any, record: any) => (
        <div className="flex gap-2">
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)}>Edit</Button>
          <Popconfirm
            title="Are you sure?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger><DeleteOutlined /></Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 bg-white min-h-[80vh]">
      <h2 className="text-xl font-bold mb-4">Manage Placement Notes</h2>

      <div className="flex flex-wrap gap-4 mb-4 justify-between">
        <div className="flex gap-4 items-center">
          <Select
            placeholder="Select Category"
            style={{ width: 200 }}
            value={selectedCategory || undefined}
            onChange={(val) => {
              setSelectedCategory(val);
              setNotes([]);
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

      <Spin spinning={loading}>
        <Table columns={columns} dataSource={filteredNotes} pagination={{ pageSize: 8 }} />
      </Spin>

      <Modal
        title="Edit Placement Note"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        onOk={handleUpdate}
        destroyOnClose
        okText="Save"
      >
        <Spin spinning={editLoading}>
          <Form form={editForm} layout="vertical">
            <Form.Item name="sub_name" label="Subject Name" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="sub_code" label="Subject Code" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="contentType" label="Content Type" rules={[{ required: true }]}>
              <Select><Option value="PDF">PDF</Option><Option value="HTML">HTML</Option></Select>
            </Form.Item>
            <Form.Item name="content" label="Content" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
            <Form.Item name="by" label="By" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="likes" label="Likes" rules={[{ required: true }]}><Input type="number" /></Form.Item>
            <Form.Item name="dislikes" label="Dislikes" rules={[{ required: true }]}><Input type="number" /></Form.Item>
          </Form>
        </Spin>
      </Modal>
    </div>
  );
};

export default ManagePlacementNotes;
