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
import { DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, update, remove } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Option } = Select;
const LECTURES_AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY;

const decryptAES = (encryptedText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(LECTURES_AES_SECRET_KEY);
    const dec = CryptoJS.AES.decrypt(encryptedText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return dec.toString(CryptoJS.enc.Utf8);
  } catch {
    return encryptedText;
  }
};

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

const ManageLectures: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [branches, setBranches] = useState<string[]>([]);
  const [lecturesData, setLecturesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editForm] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [totalCount, setTotalCount] = useState(0);

  const years = ['First_Year', 'Second_Year', 'Third_Year', 'Fourth_Year'];

  // load branches when year changes
  useEffect(() => {
    if (!selectedYear) return;
    const yearRef = dbRef(db, `version12/Materials/Lectures/${selectedYear}`);
    onValue(yearRef, snapshot => {
      const data = snapshot.val() || {};
      setBranches(Object.keys(data));
    });
  }, [selectedYear]);

  // fetch lectures list
  const handleApply = () => {
    if (!selectedYear || !selectedBranch) {
      message.warning('Please select both year and branch.');
      return;
    }
    setLoading(true);
    const lectRef = dbRef(
      db,
      `version12/Materials/Lectures/${selectedYear}/${selectedBranch}`
    );
    onValue(lectRef, snapshot => {
      const data = snapshot.val() || {};
      const list = Object.values(data).map((item: any) => ({
        key: item.id,
        id: item.id,
        by: decryptAES(item.by),
        date: item.date,
        likes: item.likes,
        dislikes: item.dislikes,
        video: decryptAES(item.pdf),
        lec_code: decryptAES(item.sub_code),
        lec_name: decryptAES(item.sub_name),
      }));
      setLecturesData(list);
      setTotalCount(list.length);
      setLoading(false);
    });
  };

  const handleEdit = (record: any) => {
    setEditingItem(record);
    editForm.setFieldsValue({
      lec_name: record.lec_name,
      lec_code: record.lec_code,
      video: record.video,
      by: record.by,
      likes: record.likes,
      dislikes: record.dislikes,
    });
    setEditModalVisible(true);
  };

  const handleUpdate = async () => {
    try {
      const vals = await editForm.validateFields();
      const path = `version12/Materials/Lectures/${selectedYear}/${selectedBranch}/${editingItem.id}`;
      const updated = {
        id: editingItem.id,
        date: new Date().toLocaleDateString(),
        by: encryptAES(vals.by),
        pdf: encryptAES(vals.video),
        sub_code: encryptAES(vals.lec_code),
        sub_name: encryptAES(vals.lec_name),
        likes: Number(vals.likes),
        dislikes: Number(vals.dislikes),
      };
      await update(dbRef(db, path), updated);
      message.success('Lecture updated successfully');
      setEditModalVisible(false);
      handleApply();
    } catch {
      message.error('Failed to update lecture');
    }
  };

  const handleDelete = async (id: string) => {
    const path = `version12/Materials/Lectures/${selectedYear}/${selectedBranch}/${id}`;
    try {
      await remove(dbRef(db, path));
      message.success('Lecture deleted');
      handleApply();
    } catch {
      message.error('Failed to delete lecture');
    }
  };

  const filtered = lecturesData.filter(item => {
    const q = searchText.toLowerCase();
    return (
      item.lec_name.toLowerCase().includes(q) ||
      item.lec_code.toLowerCase().includes(q) ||
      item.by.toLowerCase().includes(q)
    );
  });

  const columns = [
    { title: 'Lecture Name', dataIndex: 'lec_name', key: 'lec_name' },
    { title: 'Lecture Code', dataIndex: 'lec_code', key: 'lec_code' },
    {
      title: 'Video Link',
      dataIndex: 'video',
      key: 'video',
      render: (text: string) => (
        <a href={text} target="_blank" rel="noopener noreferrer">
          View
        </a>
      ),
    },
    { title: 'By', dataIndex: 'by', key: 'by' },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Likes', dataIndex: 'likes', key: 'likes' },
    { title: 'Dislikes', dataIndex: 'dislikes', key: 'dislikes' },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => handleEdit(record)}>Edit</Button>
          <Popconfirm
            title="Delete this lecture?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, background: '#fff', minHeight: '80vh' }}>
      <h2 style={{ marginBottom: 16 }}>Manage Video Lectures</h2>

      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 24,
          alignItems: 'center',
        }}
      >
        <Select
          placeholder="Select Year"
          style={{ width: 180 }}
          value={selectedYear || undefined}
          onChange={val => {
            setSelectedYear(val);
            setSelectedBranch('');
            setLecturesData([]);
            setTotalCount(0);
          }}
        >
          {years.map(y => (
            <Option key={y} value={y}>
              {y.replace('_', ' ')}
            </Option>
          ))}
        </Select>

        <Select
          placeholder="Select Branch"
          style={{ width: 180 }}
          value={selectedBranch || undefined}
          onChange={val => setSelectedBranch(val)}
          disabled={!selectedYear}
        >
          {branches.map(b => (
            <Option key={b} value={b}>
              {b}
            </Option>
          ))}
        </Select>

        <Button type="primary" onClick={handleApply}>
          Apply
        </Button>

        <Input
          placeholder="Search by Name/Code/By"
          prefix={<SearchOutlined />}
          style={{ marginLeft: 'auto', width: 300 }}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <strong>Selected:</strong>{' '}
          {selectedYear.replace('_', ' ')} / {selectedBranch || 'None'}
        </div>
        <div>
          <strong>Total Lectures:</strong> {totalCount}
        </div>
      </div>

      <Spin spinning={loading}>
        <Table columns={columns} dataSource={filtered} pagination={{ pageSize: 8 }} />
      </Spin>

      <Modal
        title="Edit Lecture"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        onOk={handleUpdate}
        okText="Save"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="Lecture Name" name="lec_name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Lecture Code" name="lec_code" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Video Link" name="video" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="By" name="by" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Likes" name="likes" rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item label="Dislikes" name="dislikes" rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ManageLectures;
