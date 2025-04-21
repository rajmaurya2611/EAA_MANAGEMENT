import React, { useEffect, useState } from 'react';
import { Table, Tag, Spin, message, Modal, Button, Select, Switch } from 'antd';
import { ref as dbRef, onValue, update } from 'firebase/database';
import { db } from '../../firebaseConfig';
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
  } catch {
    return encryptedText;
  }
};

const ManageUserContributedNotes: React.FC = () => {
  const [rawData, setRawData] = useState<any>({});
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [branchOptions, setBranchOptions] = useState<string[]>([]);

  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [filteredDocs, setFilteredDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    const ref = dbRef(db, 'version12/Contribution/Notes');
    onValue(
      ref,
      (snapshot) => {
        const val = snapshot.val();
        if (!val) {
          setRawData({});
          setYearOptions([]);
          setLoading(false);
          return;
        }

        setRawData(val);
        setYearOptions(Object.keys(val));
        setLoading(false);
      },
      (err) => {
        console.error('Firebase fetch error:', err);
        message.error('Failed to fetch notes data.');
        setLoading(false);
      }
    );
  }, []);

  useEffect(() => {
    if (selectedYear && rawData[selectedYear]) {
      setBranchOptions(Object.keys(rawData[selectedYear]));
      setSelectedBranch(null);
      setFilteredDocs([]);
    }
  }, [selectedYear]);

  useEffect(() => {
    if (selectedYear && selectedBranch) {
      const docs = rawData[selectedYear]?.[selectedBranch] || {};
      const parsed = Object.entries(docs).map(([docId, doc]: any) => {
        const [date, time] = decryptAES(doc.uploadTime || '').split(' ');
        return {
          id: docId,
          year: selectedYear,
          branch: selectedBranch,
          documentTitle: decryptAES(doc.documentTitle || ''),
          likes: doc.likes || 0,
          dislikes: doc.dislikes || 0,
          isVisible: doc.isVisible,
          isVerified: doc.isVerified,
          isDeleted: doc.isDeleted,
          subjectCode: decryptAES(doc.subjectCode || ''),
          userId: decryptAES(doc.userId || ''),
          uploadDate: date || '',
          uploadTime: time || '',
          pdfUrl: decryptAES(doc.pdfUrl || ''),
        };
      });
      setFilteredDocs(parsed);
    }
  }, [selectedBranch]);

  const handleToggle = async (
    record: any,
    field: 'isVisible' | 'isVerified'
  ) => {
    const path = `version12/Contribution/Notes/${record.year}/${record.branch}/${record.id}`;
    const updatedValue = record[field] ? 0 : 1;

    try {
      await update(dbRef(db, path), { [field]: updatedValue });
      message.success(`${field} updated`);
      setFilteredDocs((prev) =>
        prev.map((item) =>
          item.id === record.id ? { ...item, [field]: updatedValue } : item
        )
      );
    } catch (err) {
      console.error(`${field} update error`, err);
      message.error(`Failed to update ${field}`);
    }
  };

  const columns = [
    { title: 'Title', dataIndex: 'documentTitle', key: 'documentTitle' },
    { title: 'Subject', dataIndex: 'subjectCode', key: 'subjectCode' },
    {
      title: 'PDF',
      key: 'pdfUrl',
      render: (_: any, record: any) => (
        <a href={record.pdfUrl} target="_blank" rel="noopener noreferrer">
          Open PDF
        </a>
      ),
    },
    { title: 'Likes', dataIndex: 'likes', key: 'likes' },
    { title: 'Dislikes', dataIndex: 'dislikes', key: 'dislikes' },
    { title: 'Date', dataIndex: 'uploadDate', key: 'uploadDate' },
    { title: 'Time', dataIndex: 'uploadTime', key: 'uploadTime' },
    {
      title: 'Visible',
      key: 'isVisible',
      render: (_: any, record: any) => (
        <Switch
          checked={record.isVisible === 1}
          onChange={() => handleToggle(record, 'isVisible')}
        />
      ),
    },
    {
      title: 'Verified',
      key: 'isVerified',
      render: (_: any, record: any) => (
        <Switch
          checked={record.isVerified === 1}
          onChange={() => handleToggle(record, 'isVerified')}
        />
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
      <h2 className="text-xl font-semibold mb-4">📘 Manage Notes Contributions</h2>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <Select
          placeholder="Select Year"
          style={{ width: 200 }}
          value={selectedYear || undefined}
          onChange={(val) => setSelectedYear(val)}
        >
          {yearOptions.map((year) => (
            <Option key={year} value={year}>
              {year}
            </Option>
          ))}
        </Select>

        <Select
          placeholder="Select Branch"
          style={{ width: 200 }}
          value={selectedBranch || undefined}
          onChange={(val) => setSelectedBranch(val)}
          disabled={!selectedYear}
        >
          {branchOptions.map((branch) => (
            <Option key={branch} value={branch}>
              {branch}
            </Option>
          ))}
        </Select>
      </div>

      {loading ? (
        <Spin size="large" style={{ display: 'block', marginTop: 100 }} />
      ) : selectedYear && selectedBranch ? (
        <Table
          dataSource={filteredDocs}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 8 }}
        />
      ) : (
        <p>Please select a year and branch to view documents.</p>
      )}

      <Modal
        open={modalVisible}
        title="Document Details"
        onCancel={() => setModalVisible(false)}
        footer={<Button onClick={() => setModalVisible(false)}>Close</Button>}
      >
        {selectedItem && (
          <>
            <p><strong>Title:</strong> {selectedItem.documentTitle}</p>
            <p><strong>Subject:</strong> {selectedItem.subjectCode}</p>
            <p><strong>User ID:</strong> {selectedItem.userId}</p>
            <p><strong>Date:</strong> {selectedItem.uploadDate}</p>
            <p><strong>Time:</strong> {selectedItem.uploadTime}</p>
            <p>
              <strong>PDF Link:</strong>{' '}
              <a href={selectedItem.pdfUrl} target="_blank" rel="noopener noreferrer">
                Open PDF
              </a>
            </p>
          </>
        )}
      </Modal>
    </div>
  );
};

export default ManageUserContributedNotes;
