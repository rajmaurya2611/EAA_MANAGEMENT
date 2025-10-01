import React, { useEffect, useState } from 'react';
import { Table, Spin, message, Tag, Select, Modal, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, update } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Option } = Select;

// AES keys
const USER_AES_SECRET_KEY  = import.meta.env.VITE_AES_SECRET_KEY as string;
const NOTES_AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY as string;

// AES decrypt helper
function decryptAES(ciphertext: string, key: string): string {
  try {
    const parsedKey = CryptoJS.enc.Utf8.parse(key);
    const dec = CryptoJS.AES.decrypt((ciphertext || '').trim(), parsedKey, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return dec.toString(CryptoJS.enc.Utf8);
  } catch (err) {
    console.error('AES decrypt error:', err);
    return ciphertext;
  }
}

// AES encrypt helper
function encryptAES(plain: string, key: string): string {
  try {
    const parsedKey = CryptoJS.enc.Utf8.parse(key);
    return CryptoJS.AES.encrypt(plain, parsedKey, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  } catch (err) {
    console.error('AES encrypt error:', err);
    return plain;
  }
}

interface SyllabusRecord {
  id: string;
  userId: string;
  userName: string;
  userCollege: string;
  date: string;   // "DD-MM-YYYY" or "DD/MM/YYYY"
  time: string;   // "HH:mm:ss"
  status: string; // 'pending' | 'resolved' | 'not resolved'
  text: string;
}

// date+time → epoch ms for stable ordering (local time)
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

const UserRequestedSyllabus: React.FC = () => {
  const [userData, setUserData] = useState<Record<string, { name: string; college: string }>>({});
  const [allData, setAllData] = useState<SyllabusRecord[]>([]);
  const [filteredData, setFilteredData] = useState<SyllabusRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<SyllabusRecord | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all'|'pending'|'resolved'|'not resolved'>('all');
  const [statusChangedTo, setStatusChangedTo] = useState<string | null>(null);

  // 1) Load & decrypt users
  useEffect(() => {
    const usersRef = dbRef(db, 'version12/users');
    const unsub = onValue(usersRef, snap => {
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

  // 2) Load & decrypt syllabus requests whenever userData updates
  useEffect(() => {
    const sylRef = dbRef(db, 'version12/UserRequests/Syllabus');
    const unsub = onValue(sylRef, snap => {
      const raw = snap.val() || {};
      const parsed: SyllabusRecord[] = Object.entries(raw).map(
        ([id, entry]: [string, any]) => {
          const uid = decryptAES(entry.userId  || '', NOTES_AES_SECRET_KEY);
          const user = userData[uid] || { name: 'Unknown', college: 'Unknown' };
          return {
            id,
            userId:      uid,
            userName:    user.name,
            userCollege: user.college,
            date:        decryptAES(entry.date   || '', NOTES_AES_SECRET_KEY),
            time:        decryptAES(entry.time   || '', NOTES_AES_SECRET_KEY),
            status:      decryptAES(entry.status || '', NOTES_AES_SECRET_KEY).toLowerCase(),
            text:        decryptAES(entry.text   || '', NOTES_AES_SECRET_KEY),
          };
        }
      );
      setAllData(parsed);
      setLoading(false);
    }, err => {
      console.error('Fetch syllabus error:', err);
      message.error('Failed to load Syllabus requests.');
      setLoading(false);
    });
    return () => unsub();
  }, [userData]);

  // 3) Filter by status AND enforce newest-first ordering
  useEffect(() => {
    const base =
      statusFilter === 'all'
        ? allData
        : allData.filter(r => r.status === statusFilter);

    const sorted = [...base].sort(
      (a, b) => dtToMs(b.date, b.time) - dtToMs(a.date, a.time)
    );
    setFilteredData(sorted);
  }, [allData, statusFilter]);

  // 4) Handle status updates
  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await update(dbRef(db, `version12/UserRequests/Syllabus/${id}`), {
        status: encryptAES(newStatus, NOTES_AES_SECRET_KEY),
      });
      setAllData(ds => ds.map(r => r.id === id ? { ...r, status: newStatus } : r));
      if (selectedItem?.id === id) setSelectedItem({ ...selectedItem, status: newStatus });
      setStatusChangedTo(newStatus);
      message.success(`Status updated to "${newStatus}"`);
    } catch (err) {
      console.error('Status update failed:', err);
      message.error('Failed to update status');
    }
  };

  const getStatusColor = (s: string) =>
    s === 'resolved' ? 'green' : s === 'not resolved' ? 'red' : 'gold';

  // 5) Table columns — no sorters; order is controlled by filteredData
  const columns: ColumnsType<SyllabusRecord> = [
    { title:'User Name',   dataIndex:'userName',    key:'userName'   },
    { title:'College',     dataIndex:'userCollege', key:'userCollege'},
    { title:'Date',        dataIndex:'date',        key:'date'       },
    { title:'Time',        dataIndex:'time',        key:'time'       },
    {
      title:'Text',
      dataIndex:'text',
      key:'text',
      render: (t: string) => (
        <div style={{ maxWidth:300, whiteSpace:'pre-wrap', wordWrap:'break-word' }}>
          {t}
        </div>
      )
    },
    {
      title:'Status',
      key:'status',
      render: (_:unknown, r) => (
        <Tag color={getStatusColor(r.status)}>{r.status}</Tag>
      )
    },
    {
      title:'Action',
      key:'action',
      render: (_:unknown, r) => (
        <Button
          type="primary"
          onClick={()=>{ setSelectedItem(r); setStatusChangedTo(null); setModalVisible(true); }}
        >
          View
        </Button>
      )
    }
  ];

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
        <h2 className="text-xl font-semibold">User Requested Syllabus</h2>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Select value={statusFilter} onChange={(v: SyllabusRecord['status'] | 'all') => setStatusFilter(v as any)} style={{ width:200 }}>
            <Option value="all">All</Option>
            <Option value="pending">Pending</Option>
            <Option value="resolved">Resolved</Option>
            <Option value="not resolved">Not Resolved</Option>
          </Select>
          <span style={{ fontWeight:500 }}>Total: {filteredData.length}</span>
        </div>
      </div>

      {loading ? (
        <Spin size="large" style={{ display:'block', margin:'100px auto' }} />
      ) : (
        <Table<SyllabusRecord>
          dataSource={filteredData}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize:8 }}
          scroll={{ x:true }}
        />
      )}

      <Modal
        open={modalVisible}
        title="Request Details"
        onCancel={()=>setModalVisible(false)}
        footer={<Button onClick={()=>setModalVisible(false)}>Close</Button>}
      >
        {selectedItem && (
          <>
            <p><strong>User ID:</strong> {selectedItem.userId}</p>
            <p><strong>User Name:</strong> {selectedItem.userName}</p>
            <p><strong>College:</strong> {selectedItem.userCollege}</p>
            <p><strong>Date:</strong> {selectedItem.date}</p>
            <p><strong>Time:</strong> {selectedItem.time}</p>
            <p><strong>Text:</strong> {selectedItem.text}</p>

            <div style={{ marginTop:16 }}>
              <strong>Status:</strong>
              <Select
                value={selectedItem.status}
                style={{ marginLeft:10, width:180 }}
                onChange={val => handleStatusChange(selectedItem.id, val)}
              >
                <Option value="pending">Pending</Option>
                <Option value="resolved">Resolved</Option>
                <Option value="not resolved">Not Resolved</Option>
              </Select>
            </div>

            {statusChangedTo && (
              <p style={{ marginTop:12 }}>
                ✅ Status changed to <Tag color={getStatusColor(statusChangedTo)}>{statusChangedTo}</Tag>
              </p>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default UserRequestedSyllabus;
