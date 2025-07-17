import React, { useEffect, useState } from 'react';
import { Table, Spin, message, Tag, Select, Modal, Button } from 'antd';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, update } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Option } = Select;

// AES keys
const USER_AES_SECRET_KEY  = import.meta.env.VITE_AES_SECRET_KEY as string;
const NOTES_AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY as string;

// ———————————————————————————————————————————
// Helper: decrypt *without* trimming, but strip ALL whitespace inside ciphertext
// ———————————————————————————————————————————
function decryptAES(encryptedText: string, key: string): string {
  try {
    // remove ALL whitespace characters (spaces, newlines, tabs) from ciphertext
    const normalized = encryptedText.replace(/\s+/g, '');
    const parsedKey  = CryptoJS.enc.Utf8.parse(key);
    const dec        = CryptoJS.AES.decrypt(normalized, parsedKey, {
      mode:    CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return dec.toString(CryptoJS.enc.Utf8);
  } catch (err) {
    console.error('AES decrypt error:', err);
    return encryptedText;
  }
}

// AES encrypt helper (unchanged)
function encryptAES(plainText: string, key: string): string {
  try {
    const parsedKey = CryptoJS.enc.Utf8.parse(key);
    return CryptoJS.AES.encrypt(plainText, parsedKey, {
      mode:    CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  } catch (err) {
    console.error('AES encrypt error:', err);
    return plainText;
  }
}

interface QuantumRecord {
  id:           string;
  userId:       string;
  userName:     string;
  userCollege:  string;
  date:         string;
  time:         string;
  status:       'pending' | 'resolved' | 'not resolved';
  text:         string;
}

const UserRequestedQuantums: React.FC = () => {
  const [userData, setUserData]           = useState<Record<string, { name: string; college: string }>>({});
  const [allData, setAllData]             = useState<QuantumRecord[]>([]);
  const [filteredData, setFilteredData]   = useState<QuantumRecord[]>([]);
  const [loading, setLoading]             = useState(true);
  const [selectedItem, setSelectedItem]   = useState<QuantumRecord | null>(null);
  const [modalVisible, setModalVisible]   = useState(false);
  const [statusFilter, setStatusFilter]   = useState<'all'|'pending'|'resolved'|'not resolved'>('all');
  const [statusChangedTo, setStatusChangedTo] = useState<string | null>(null);

  // 1) Load & decrypt users
  useEffect(() => {
    const usersRef = dbRef(db, 'version12/users');
    const unsub    = onValue(usersRef, snap => {
      const raw = snap.val() || {};
      const map: typeof userData = {};
      Object.entries(raw).forEach(([uid, entry]: [string, any]) => {
        map[uid] = {
          name:    decryptAES(entry.name    || '', USER_AES_SECRET_KEY),
          college: decryptAES(entry.college || '', USER_AES_SECRET_KEY),
        };
      });
      setUserData(map);
    });
    return () => unsub();
  }, []);

  // 2) Load & decrypt quantum requests
  useEffect(() => {
    const quantRef = dbRef(db, 'version12/UserRequests/Quantum');
    const unsub    = onValue(
      quantRef,
      snap => {
        const raw = snap.val() || {};
        const parsed: QuantumRecord[] = Object.entries(raw).map(
          ([id, entry]: [string, any]) => {
            const plainUserId = decryptAES(entry.userId  || '', NOTES_AES_SECRET_KEY);
            const user        = userData[plainUserId] || { name: 'Unknown', college: 'Unknown' };
            return {
              id,
              userId:      plainUserId,
              userName:    user.name,
              userCollege: user.college,
              date:        decryptAES(entry.date   || '', NOTES_AES_SECRET_KEY),
              time:        decryptAES(entry.time   || '', NOTES_AES_SECRET_KEY),
              status:      decryptAES(entry.status || '', NOTES_AES_SECRET_KEY).toLowerCase() as QuantumRecord['status'],
              text:        decryptAES(entry.text   || '', NOTES_AES_SECRET_KEY),
            };
          }
        );
        setAllData(parsed);
        setLoading(false);
      },
      err => {
        console.error('Fetch quantum error:', err);
        message.error('Failed to load quantum requests.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [userData]);

  // 3) Apply status filter
  useEffect(() => {
    setFilteredData(
      statusFilter === 'all'
        ? allData
        : allData.filter(item => item.status === statusFilter)
    );
  }, [allData, statusFilter]);

  // 4) Status update handler
  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await update(dbRef(db, `version12/UserRequests/Quantum/${id}`), {
        status: encryptAES(newStatus, NOTES_AES_SECRET_KEY),
      });
      const updated = allData.map(rec =>
        rec.id === id ? { ...rec, status: newStatus as QuantumRecord['status'] } : rec
      );
      setAllData(updated);
      if (selectedItem?.id === id) {
        setSelectedItem({ ...selectedItem, status: newStatus as QuantumRecord['status'] });
      }
      setStatusChangedTo(newStatus);
      message.success(`Status updated to "${newStatus}"`);
    } catch (err) {
      console.error('Status update failed:', err);
      message.error('Failed to update status');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved':     return 'green';
      case 'not resolved': return 'red';
      default:             return 'gold';
    }
  };

  // 5) Table columns
  const columns = [
    { title: 'User Name', dataIndex: 'userName',    key: 'userName' },
    { title: 'College',   dataIndex: 'userCollege', key: 'userCollege' },
    { title: 'Date',      dataIndex: 'date',        key: 'date' },
    { title: 'Time',      dataIndex: 'time',        key: 'time' },
    {
      title: 'Text',
      dataIndex: 'text',
      key: 'text',
      render: (t: string) => (
        // manage large inputs with wrapping and a max width
        <div style={{ maxWidth: 300, whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
          {t}
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: any, r: QuantumRecord) => (
        <Tag color={getStatusColor(r.status)}>{r.status}</Tag>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, r: QuantumRecord) => (
        <Button
          type="primary"
          onClick={() => {
            setSelectedItem(r);
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
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 className="text-xl font-semibold">User Requested Quantums</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Select<'all'|'pending'|'resolved'|'not resolved'>
            value={statusFilter}
            onChange={val => setStatusFilter(val)}
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

      {/* Table */}
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

      {/* Modal */}
      <Modal
        open={modalVisible}
        title="Request Details"
        onCancel={() => setModalVisible(false)}
        footer={<Button onClick={() => setModalVisible(false)}>Close</Button>}
      >
        {selectedItem && (
          <>
            <p><strong>User ID:</strong> {selectedItem.userId}</p>
            <p><strong>User Name:</strong> {selectedItem.userName}</p>
            <p><strong>College:</strong> {selectedItem.userCollege}</p>
            <p><strong>Date:</strong> {selectedItem.date}</p>
            <p><strong>Time:</strong> {selectedItem.time}</p>
            <p><strong>Text:</strong></p>
            <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', marginBottom: 16 }}>
              {selectedItem.text}
            </div>

            <div style={{ marginTop: 16 }}>
              <strong>Status:</strong>
              <Select
                value={selectedItem.status}
                style={{ marginLeft: 10, width: 180 }}
                onChange={val => handleStatusChange(selectedItem.id, val)}
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

export default UserRequestedQuantums;
