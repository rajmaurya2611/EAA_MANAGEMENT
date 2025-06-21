import React, { useEffect, useState } from 'react';
import { Table, Spin, message, Tag, Select, Modal, Button } from 'antd';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, update } from 'firebase/database';
import CryptoJS from 'crypto-js';
//import { DeleteOutlined, SearchOutlined } from '@ant-design/icons';

const { Option } = Select;

// Use the same AES key you already have in env
const REQUESTS_AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY;

const decryptAES = (encryptedText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(REQUESTS_AES_SECRET_KEY);
    const dec = CryptoJS.AES.decrypt(encryptedText.trim(), key, {
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
    const key = CryptoJS.enc.Utf8.parse(REQUESTS_AES_SECRET_KEY);
    return CryptoJS.AES.encrypt(plainText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  } catch {
    return plainText;
  }
};

interface RequestRecord {
  id: string;
  userId: string;
  date: string;
  time: string;
  status: string;
  text: string;
}

const UserRequestedLectures: React.FC = () => {
  const [allData, setAllData] = useState<RequestRecord[]>([]);
  const [filteredData, setFilteredData] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<RequestRecord | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [statusChangedTo, setStatusChangedTo] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Load data once
  useEffect(() => {
    const lecturesRef = dbRef(db, 'version12/UserRequests/Lectures');
    const unsub = onValue(
      lecturesRef,
      snapshot => {
        const val = snapshot.val() || {};
        const parsed: RequestRecord[] = Object.entries(val).map(
          ([id, entry]: [string, any]) => ({
            id,
            userId: decryptAES(entry.userId || ''),
            date: decryptAES(entry.date || ''),
            time: decryptAES(entry.time || ''),
            status: decryptAES(entry.status || '').toLowerCase(),
            text: decryptAES(entry.text || ''),
          })
        );
        setAllData(parsed);
        setLoading(false);
      },
      err => {
        console.error(err);
        message.error('Failed to load lecture requests.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Filter by status
  useEffect(() => {
    setFilteredData(
      statusFilter === 'all'
        ? allData
        : allData.filter(item => item.status === statusFilter)
    );
  }, [allData, statusFilter]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const enc = encryptAES(newStatus);
    const path = `version12/UserRequests/Lectures/${id}`;
    try {
      await update(dbRef(db, path), { status: enc });
      setAllData(data =>
        data.map(item => (item.id === id ? { ...item, status: newStatus } : item))
      );
      setSelectedItem(prev =>
        prev && prev.id === id ? { ...prev, status: newStatus } : prev
      );
      setStatusChangedTo(newStatus);
      message.success(`Status updated to "${newStatus}"`);
    } catch {
      message.error('Failed to update status');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved':
        return 'green';
      case 'not resolved':
        return 'red';
      default:
        return 'gold';
    }
  };

  const columns = [
    { title: 'User ID', dataIndex: 'userId', key: 'userId' },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Time', dataIndex: 'time', key: 'time' },
    {
      title: 'Text',
      dataIndex: 'text',
      key: 'text',
      render: (t: string) => (
        <div style={{ maxWidth: 300, whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
          {t}
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: any, record: RequestRecord) => (
        <Tag color={getStatusColor(record.status)}>{record.status}</Tag>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: RequestRecord) => (
        <Button
          type="primary"
          onClick={() => {
            setSelectedItem(record);
            setStatusChangedTo(null);
            setModalVisible(true);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, background: '#fff', minHeight: '80vh' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <h2>User Requested Lectures</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Select
            value={statusFilter}
            onChange={val => setStatusFilter(val)}
            style={{ width: 180 }}
          >
            <Option value="all">All</Option>
            <Option value="pending">Pending</Option>
            <Option value="resolved">Resolved</Option>
            <Option value="not resolved">Not Resolved</Option>
          </Select>
          <span><strong>Total:</strong> {filteredData.length}</span>
        </div>
      </div>

      {loading ? (
        <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
      ) : (
        <Table
          dataSource={filteredData}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 8 }}
          scroll={{ x: true }}
        />
      )}

      <Modal
        open={modalVisible}
        title="Lecture Request Details"
        onCancel={() => setModalVisible(false)}
        footer={<Button onClick={() => setModalVisible(false)}>Close</Button>}
      >
        {selectedItem && (
          <>
            <p><strong>User ID:</strong> {selectedItem.userId}</p>
            <p><strong>Date:</strong> {selectedItem.date}</p>
            <p><strong>Time:</strong> {selectedItem.time}</p>
            <p><strong>Text:</strong> {selectedItem.text}</p>

            <div style={{ marginTop: 16 }}>
              <strong>Status:</strong>
              <Select
                style={{ marginLeft: 10, width: 180 }}
                value={selectedItem.status}
                onChange={value => handleStatusChange(selectedItem.id, value)}
              >
                <Option value="pending">Pending</Option>
                <Option value="resolved">Resolved</Option>
                <Option value="not resolved">Not Resolved</Option>
              </Select>
            </div>

            {statusChangedTo && (
              <p style={{ marginTop: 12 }}>
                ✅ Status changed to{' '}
                <Tag color={getStatusColor(statusChangedTo)}>{statusChangedTo}</Tag>
              </p>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default UserRequestedLectures;
