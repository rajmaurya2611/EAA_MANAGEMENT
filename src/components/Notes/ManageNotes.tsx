import React, { useEffect, useState } from 'react';
import {
  Layout,
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
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, update, remove } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Option } = Select;

const NOTES_AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY;

const decryptAES = (encryptedText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(NOTES_AES_SECRET_KEY);
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
    const key = CryptoJS.enc.Utf8.parse(NOTES_AES_SECRET_KEY);
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

const ManageNotes: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [branches, setBranches] = useState<string[]>([]);
  const [notesData, setNotesData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [editForm] = Form.useForm();

  const years = ['First_Year', 'Second_Year', 'Third_Year', 'Fourth_Year'];

  useEffect(() => {
    if (selectedYear) {
      const yearRef = dbRef(db, `version12/Materials/Notes/${selectedYear}`);
      onValue(yearRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setBranches(Object.keys(data));
        } else {
          setBranches([]);
        }
      });
    }
  }, [selectedYear]);

  const handleApply = () => {
    if (!selectedYear || !selectedBranch) {
      message.warning('Please select both year and branch.');
      return;
    }
    setLoading(true);
    const notesRef = dbRef(db, `version12/Materials/Notes/${selectedYear}/${selectedBranch}`);
    onValue(notesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const notesList = Object.values(data).map((note: any) => ({
          key: note.id,
          id: note.id,
          by: decryptAES(note.by),
          date: note.date,
          dislikes: note.dislikes,
          likes: note.likes,
          pdf: decryptAES(note.pdf),
          sub_code: decryptAES(note.sub_code),
          sub_name: decryptAES(note.sub_name),
        }));
        setNotesData(notesList);
      } else {
        setNotesData([]);
      }
      setLoading(false);
    });
  };

  const handleEdit = (record: any) => {
    setEditingNote(record);
    editForm.setFieldsValue({
      sub_name: record.sub_name,
      sub_code: record.sub_code,
      pdf: record.pdf,
      by: record.by,
      likes: record.likes,
      dislikes: record.dislikes,
    });
    setEditModalVisible(true);
  };

  const handleUpdate = async () => {
    try {
      const values = await editForm.validateFields();
      const path = `version12/Materials/Notes/${selectedYear}/${selectedBranch}/${editingNote.id}`;
      const updatedData = {
        id: editingNote.id,
        date: editingNote.date,
        by: encryptAES(values.by),
        pdf: encryptAES(values.pdf),
        sub_code: encryptAES(values.sub_code),
        sub_name: encryptAES(values.sub_name),
        likes: Number(values.likes),
        dislikes: Number(values.dislikes),
      };
      await update(dbRef(db, path), updatedData);
      message.success('Note updated successfully');
      setEditModalVisible(false);
      handleApply();
    } catch (error) {
      message.error('Failed to update note');
    }
  };

  const handleDelete = async (noteId: string) => {
    const path = `version12/Materials/Notes/${selectedYear}/${selectedBranch}/${noteId}`;
    try {
      await remove(dbRef(db, path));
      message.success('Note deleted successfully');
      handleApply();
    } catch (error) {
      message.error('Failed to delete note');
    }
  };

  const columns = [
    { title: 'Subject Name', dataIndex: 'sub_name', key: 'sub_name' },
    { title: 'Subject Code', dataIndex: 'sub_code', key: 'sub_code' },
    { title: 'PDF Link', dataIndex: 'pdf', key: 'pdf', render: (text: string) => <a href={text} target="_blank" rel="noopener noreferrer">Open</a> },
    { title: 'By', dataIndex: 'by', key: 'by' },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Likes', dataIndex: 'likes', key: 'likes' },
    { title: 'Dislikes', dataIndex: 'dislikes', key: 'dislikes' },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: any) => (
        <>
          <Button type="link" onClick={() => handleEdit(record)}>Edit</Button>
          <Popconfirm
            title="Are you sure you want to delete this note?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="link" danger>Delete</Button>
          </Popconfirm>
        </>
      )
    },
  ];

  return (
    <Layout style={{ padding: '24px', background: '#fff', minHeight: '80vh' }}>
      <div style={{ marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <Select
          placeholder="Select Year"
          style={{ width: 200 }}
          value={selectedYear || undefined}
          onChange={(value) => {
            setSelectedYear(value);
            setSelectedBranch('');
            setNotesData([]);
          }}
        >
          {years.map((year) => (
            <Option key={year} value={year}>{year.replace('_', ' ')}</Option>
          ))}
        </Select>

        <Select
          placeholder="Select Branch"
          style={{ width: 200 }}
          value={selectedBranch || undefined}
          onChange={(value) => setSelectedBranch(value)}
          disabled={!selectedYear}
        >
          {branches.map((branch) => (
            <Option key={branch} value={branch}>{branch}</Option>
          ))}
        </Select>

        <Button type="primary" onClick={handleApply}>
          Apply
        </Button>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <strong>Selected:</strong> {selectedYear.replace('_', ' ')} / {selectedBranch || 'None'}
      </div>

      <Spin spinning={loading}>
        <Table
          columns={columns}
          dataSource={notesData}
          pagination={{ pageSize: 8 }}
        />
      </Spin>

      <Modal
        title="Edit Note"
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
    </Layout>
  );
};

export default ManageNotes;