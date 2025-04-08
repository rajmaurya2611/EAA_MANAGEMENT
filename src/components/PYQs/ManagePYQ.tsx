// ManagePYQs.tsx
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

const PYQ_AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY;

const decryptAES = (encryptedText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(PYQ_AES_SECRET_KEY);
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
    const key = CryptoJS.enc.Utf8.parse(PYQ_AES_SECRET_KEY);
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

const ManagePYQs: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [pyqData, setPyqData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [editForm] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [totalCount, setTotalCount] = useState<number>(0);

  const years = ['First_Year', 'Second_Year', 'Third_Year', 'Fourth_Year'];

  // When a year is selected, update the list of branches.
  // NOTE: We no longer reset the selectedBranch value.
  useEffect(() => {
    if (selectedYear) {
      const yearRef = dbRef(db, `version12/Materials/Pyq/${selectedYear}`);
      onValue(yearRef, (snapshot) => {
        const data = snapshot.val();
        const branchKeys = data ? Object.keys(data) : [];
        setBranches(branchKeys);
        // Removed: resetting selectedBranch, sessions, and pyqData
      });
    }
  }, [selectedYear]);

  // When a branch is selected, update the list of sessions.
  // NOTE: We no longer reset the selectedSession value.
  useEffect(() => {
    if (selectedYear && selectedBranch) {
      const sessionRef = dbRef(db, `version12/Materials/Pyq/${selectedYear}/${selectedBranch}`);
      onValue(sessionRef, (snapshot) => {
        const data = snapshot.val();
        const sessionKeys = data ? Object.keys(data) : [];
        setSessions(sessionKeys);
        // Removed: resetting selectedSession and pyqData
      });
    }
  }, [selectedBranch, selectedYear]);

  // Auto-apply filter when all dropdowns have a valid selection.
  useEffect(() => {
    if (selectedYear && selectedBranch && selectedSession) {
      handleApply();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedBranch, selectedSession]);

  const handleApply = () => {
    if (!selectedYear || !selectedBranch || !selectedSession) {
      message.warning('Please select year, branch, and session.');
      return;
    }
    setLoading(true);
    const dataRef = dbRef(
      db,
      `version12/Materials/Pyq/${selectedYear}/${selectedBranch}/${selectedSession}`
    );
    onValue(dataRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.values(data).map((item: any) => ({
          key: item.id,
          id: item.id,
          by: decryptAES(item.by),
          date: item.date,
          dislikes: item.dislikes,
          likes: item.likes,
          pdf: decryptAES(item.pdf),
          sub_code: decryptAES(item.sub_code),
          sub_name: decryptAES(item.sub_name),
        }));
        setPyqData(list);
        setTotalCount(list.length);
      } else {
        setPyqData([]);
        setTotalCount(0);
      }
      setLoading(false);
    });
  };

  const handleEdit = (record: any) => {
    setEditingNote(record);
    editForm.setFieldsValue(record);
    setEditModalVisible(true);
  };

  const handleUpdate = async () => {
    try {
      const values = await editForm.validateFields();
      const path = `version12/Materials/Pyq/${selectedYear}/${selectedBranch}/${selectedSession}/${editingNote.id}`;
      const updatedData = {
        id: editingNote.id,
        date: new Date().toLocaleDateString(),
        by: encryptAES(values.by),
        pdf: encryptAES(values.pdf),
        sub_code: encryptAES(values.sub_code),
        sub_name: encryptAES(values.sub_name),
        likes: Number(values.likes),
        dislikes: Number(values.dislikes),
      };
      await update(dbRef(db, path), updatedData);
      message.success('PYQ updated successfully');
      setEditModalVisible(false);
      handleApply();
    } catch (error) {
      message.error('Failed to update PYQ');
    }
  };

  const handleDelete = async (noteId: string) => {
    const path = `version12/Materials/Pyq/${selectedYear}/${selectedBranch}/${selectedSession}/${noteId}`;
    try {
      await remove(dbRef(db, path));
      message.success('PYQ deleted successfully');
      handleApply();
    } catch (error) {
      message.error('Failed to delete PYQ');
    }
  };

  const filteredData = pyqData.filter((note) => {
    const q = searchText.toLowerCase();
    return (
      note.sub_name.toLowerCase().includes(q) ||
      note.sub_code.toLowerCase().includes(q) ||
      note.by.toLowerCase().includes(q)
    );
  });

  const columns = [
    { title: 'Subject Name', dataIndex: 'sub_name', key: 'sub_name' },
    { title: 'Subject Code', dataIndex: 'sub_code', key: 'sub_code' },
    {
      title: 'PDF Link',
      dataIndex: 'pdf',
      key: 'pdf',
      render: (text: string) => (
        <a
          href={text}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          Open
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
        <div className="flex items-center gap-2">
          <Button type="default" onClick={() => handleEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this PYQ?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="link" danger>
              <DeleteOutlined className="text-lg" />
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', background: '#fff', minHeight: '80vh' }}>
      <h2 className="text-xl font-bold mb-4">Manage PYQs</h2>
      <div
        style={{
          marginBottom: '24px',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Select
            placeholder="Select Year"
            style={{ width: 160 }}
            value={selectedYear || undefined}
            onChange={(value) => setSelectedYear(value)}
          >
            {years.map((year) => (
              <Option key={year} value={year}>
                {year.replace('_', ' ')}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="Select Branch"
            style={{ width: 160 }}
            value={selectedBranch || undefined}
            onChange={(value) => setSelectedBranch(value)}
            disabled={!selectedYear}
          >
            {branches.map((branch) => (
              <Option key={branch} value={branch}>
                {branch}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="Select Session"
            style={{ width: 160 }}
            value={selectedSession || undefined}
            onChange={(value) => setSelectedSession(value)}
            disabled={!selectedBranch}
          >
            {sessions.map((session) => (
              <Option key={session} value={session}>
                {session}
              </Option>
            ))}
          </Select>
          {/* The Apply button has been removed as the data now loads automatically upon selection */}
        </div>
        <Input
          placeholder="Search by Subject Name/Code/By"
          className="w-full max-w-md"
          value={searchText}
          prefix={<SearchOutlined className="text-gray-400" />}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <strong>Selected:</strong>{' '}
          {selectedYear ? selectedYear.replace('_', ' ') : 'None'} /{' '}
          {selectedBranch || 'None'} / {selectedSession || 'None'}
        </div>
        <div style={{ fontWeight: 'bold' }}>Total PYQs: {totalCount}</div>
      </div>

      <Spin spinning={loading}>
        <Table columns={columns} dataSource={filteredData} pagination={{ pageSize: 8 }} />
      </Spin>

      <Modal
        title="Edit PYQ"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        onOk={handleUpdate}
        okText="Save"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="Subject Name" name="sub_name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Subject Code" name="sub_code" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="PDF Link" name="pdf" rules={[{ required: true }]}>
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

export default ManagePYQs;
