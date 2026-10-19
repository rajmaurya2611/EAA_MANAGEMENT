import React, { useEffect, useState } from 'react';
import { Table, Spin, message, Tag, Select, Modal, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, update } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Option } = Select;

const USER_AES_SECRET_KEY = import.meta.env.VITE_AES_SECRET_KEY as string;                // A1B2C3D4E5F6G7H8
const NOTES_AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY as string;    // YADURAJU12345678

function decryptAES(encryptedText: string, key: string): string {
  try {
    const parsedKey = CryptoJS.enc.Utf8.parse(key);
    const dec = CryptoJS.AES.decrypt(encryptedText.trim(), parsedKey, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return dec.toString(CryptoJS.enc.Utf8);
  } catch {
    return encryptedText;
  }
}

function encryptAES(plainText: string, key: string): string {
  try {
    const parsedKey = CryptoJS.enc.Utf8.parse(key);
    return CryptoJS.AES.encrypt(plainText, parsedKey, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  } catch {
    return plainText;
  }
}

interface NoteRecord {
  id: string;
  userId: string;
  userName: string;
  userCollege: string;
  date: string;   // "DD-MM-YYYY" or "DD/MM/YYYY"
  time: string;   // "HH:mm:ss"
  status: string; // 'pending' | 'resolved' | 'not resolved'
  text: string;
}

/** date+time → epoch ms for ordering (local time ok). */
function dtToMs(dateStr: string, timeStr: string): number {
  if (!dateStr) return 0;
  const [dRaw, mRaw, yRaw] = dateStr.split(/[-/]/);
  const d = parseInt(dRaw ?? '0', 10);
  const m = parseInt(mRaw ?? '0', 10);
  const y = parseInt(yRaw ?? '0', 10);
  const [hhRaw = '0', mmRaw = '0', ssRaw = '0'] = (timeStr || '').split(':');
  const hh = parseInt(hhRaw, 10) || 0;
  const mm = parseInt(mmRaw, 10) || 0;
  const ss = parseInt(ssRaw, 10) || 0;
  if (!y || !m || !d) return 0;
  const t = new Date(y, m - 1, d, hh, mm, ss).getTime();
  return Number.isFinite(t) ? t : 0;
}

const UserRequestedNotes: React.FC = () => {
  const [userData, setUserData] = useState<Record<string, { name: string; college: string }>>({});
  const [allData, setAllData] = useState<NoteRecord[]>([]);
  const [filteredData, setFilteredData] = useState<NoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<NoteRecord | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [statusChangedTo, setStatusChangedTo] = useState<string | null>(null);

  // 1) Load and decrypt users
  useEffect(() => {
    const usersRef = dbRef(db, 'version12/users');
    const unsub = onValue(usersRef, (snap) => {
      const raw = snap.val() || {};
      const map: Record<string, { name: string; college: string }> = {};
      Object.entries(raw).forEach(([uid, entry]: [string, any]) => {
        map[uid] = {
          name: decryptAES(entry.name || '', USER_AES_SECRET_KEY),
          college: decryptAES(entry.college || '', USER_AES_SECRET_KEY),
        };
      });
      setUserData(map);
    });
    return () => unsub();
  }, []);

  // 2) Load and decrypt notes, map in user info
  useEffect(() => {
    const notesRef = dbRef(db, 'version12/UserRequests/Notes');
    const unsub = onValue(
      notesRef,
      (snap) => {
        const raw = snap.val() || {};
        const parsed: NoteRecord[] = Object.entries(raw).map(
          ([id, entry]: [string, any]) => {
            const plainUserId = decryptAES(entry.userId || '', NOTES_AES_SECRET_KEY);
            const user = userData[plainUserId] || { name: 'Unknown', college: 'Unknown' };
            return {
              id,
              userId: plainUserId,
              userName: user.name,
              userCollege: user.college,
              date: decryptAES(entry.date || '', NOTES_AES_SECRET_KEY),
              time: decryptAES(entry.time || '', NOTES_AES_SECRET_KEY),
              status: decryptAES(entry.status || '', NOTES_AES_SECRET_KEY).toLowerCase(),
              text: decryptAES(entry.text || '', NOTES_AES_SECRET_KEY),
            };
          }
        );
        setAllData(parsed);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        message.error('Failed to load notes.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [userData]);

  // 3) Filter by status AND enforce newest-first ordering
  useEffect(() => {
    const base =
      statusFilter === 'all'
        ? allData
        : allData.filter((item) => item.status === statusFilter);

    const sorted = [...base].sort(
      (a, b) => dtToMs(b.date, b.time) - dtToMs(a.date, a.time)
    );
    setFilteredData(sorted);
  }, [allData, statusFilter]);

  // 4) Update status handler
  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await update(dbRef(db, `version12/UserRequests/Notes/${id}`), {
        status: encryptAES(newStatus, NOTES_AES_SECRET_KEY),
      });
      const updated = allData.map((rec) =>
        rec.id === id ? { ...rec, status: newStatus } : rec
      );
      setAllData(updated);
      if (selectedItem?.id === id) {
        setSelectedItem({ ...selectedItem, status: newStatus });
      }
      setStatusChangedTo(newStatus);
      message.success(`Status updated to "${newStatus}"`);
    } catch (err) {
      console.error(err);
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

  // 5) Columns — no sorter on Date/Time
  const columns: ColumnsType<NoteRecord> = [
    { title: 'User Name', dataIndex: 'userName', key: 'userName' },
    { title: 'College', dataIndex: 'userCollege', key: 'userCollege' },
    { title: 'Date', dataIndex: 'date', key: 'date' }, // sorter removed
    { title: 'Time', dataIndex: 'time', key: 'time' }, // sorter removed
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
      render: (_: unknown, r) => <Tag color={getStatusColor(r.status)}>{r.status}</Tag>,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, r) => (
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
        <h2 className="text-xl font-semibold">User Requested Notes</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Select value={statusFilter} onChange={(v: string) => setStatusFilter(v)} style={{ width: 150 }}>
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
        <Table<NoteRecord>
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
            <p><strong>Text:</strong> {selectedItem.text}</p>

            <div style={{ marginTop: 16 }}>
              <strong>Status:</strong>
              <Select
                value={selectedItem.status}
                style={{ marginLeft: 10, width: 180 }}
                onChange={(val: string) => handleStatusChange(selectedItem.id, val)}
              >
                <Option value="pending">Pending</Option>
                <Option value="resolved">Resolved</Option>
                <Option value="not resolved">Not Resolved</Option>
              </Select>
            </div>

            {statusChangedTo && (
              <p style={{ marginTop: 12 }}>
                ✅ Status changed to <Tag color={getStatusColor(statusChangedTo)}>{statusChangedTo}</Tag>
              </p>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default UserRequestedNotes;
