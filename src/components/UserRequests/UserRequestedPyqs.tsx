import React, { useEffect, useState } from 'react';
import { Table, Spin, message, Tag, Select, Modal, Button } from 'antd';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, update } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Option } = Select;
const AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY;

const decryptAES = (encryptedText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(AES_SECRET_KEY);
    const decrypted = CryptoJS.AES.decrypt(encryptedText.trim(), key, {
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
    const key = CryptoJS.enc.Utf8.parse(AES_SECRET_KEY);
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

const UserRequestedPYQs: React.FC = () => {
  const [allData, setAllData] = useState<any[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [statusChangedTo, setStatusChangedTo] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    const ref = dbRef(db, 'version12/UserRequests/Pyqs');

    const unsubscribe = onValue(
      ref,
      (snapshot) => {
        const val = snapshot.val();
        if (!val) {
          setAllData([]);
          setFilteredData([]);
          setLoading(false);
          return;
        }

        const parsed = Object.entries(val).map(([id, entry]: [string, any]) => ({
          id,
          userId: decryptAES(entry.userId || ''),
          date: decryptAES(entry.date || ''),
          time: decryptAES(entry.time || ''),
          status: decryptAES(entry.status || '').toLowerCase(),
          text: decryptAES(entry.text || ''),
        }));

        setAllData(parsed);
        setLoading(false);
      },
      (err) => {
        console.error('Firebase fetch error:', err);
        message.error('Failed to load PYQ requests.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredData(allData);
    } else {
      setFilteredData(allData.filter((item) => item.status === statusFilter));
    }
  }, [allData, statusFilter]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const encryptedStatus = encryptAES(newStatus);
    const path = `version12/UserRequests/Pyqs/${id}`;

    try {
      await update(dbRef(db, path), { status: encryptedStatus });

      const updatedData = allData.map((item) =>
        item.id === id ? { ...item, status: newStatus } : item
      );

      setAllData(updatedData);
      setSelectedItem((prev: any) => prev ? { ...prev, status: newStatus } : prev);
      setStatusChangedTo(newStatus);
      message.success(`Status updated to "${newStatus}"`);
    } catch (error) {
      console.error('Status update failed:', error);
      message.error('Failed to update status');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'resolved':
        return 'green';
      case 'not resolved':
        return 'red';
      case 'pending':
      default:
        return 'gold';
    }
  };

  const columns = [
    {
      title: 'User ID',
      dataIndex: 'userId',
      key: 'userId',
    },
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: 'Time',
      dataIndex: 'time',
      key: 'time',
    },
    {
      title: 'Text',
      dataIndex: 'text',
      key: 'text',
      render: (text: string) => (
        <div style={{ maxWidth: 300, whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
          {text}
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: any, record: any) => (
        <Tag color={getStatusColor(record.status)}>{record.status}</Tag>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: any) => (
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
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 className="text-xl font-semibold">User Requested PYQs</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Select
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
            style={{ width: 200 }}
          >
            <Option value="all">All</Option>
            <Option value="pending">Pending</Option>
            <Option value="resolved">Resolved</Option>
            <Option value="not resolved">Not Resolved</Option>
          </Select>
          <span style={{ fontWeight: 500 }}>Total: {filteredData.length}</span>
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
        title="View Request Details"
        onCancel={() => setModalVisible(false)}
        footer={<Button onClick={() => setModalVisible(false)}>Close</Button>}
      >
        {selectedItem && (
          <div>
            <p><strong>User ID:</strong> {selectedItem.userId}</p>
            <p><strong>Date:</strong> {selectedItem.date}</p>
            <p><strong>Time:</strong> {selectedItem.time}</p>
            <p><strong>Text:</strong> {selectedItem.text}</p>

            <div style={{ marginTop: 16 }}>
              <strong>Status:</strong>
              <Select
                style={{ marginLeft: 10, width: 180 }}
                value={selectedItem.status}
                onChange={(value) => {
                  handleStatusChange(selectedItem.id, value);
                }}
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
          </div>
        )}
      </Modal>
    </div>
  );
};

export default UserRequestedPYQs;
