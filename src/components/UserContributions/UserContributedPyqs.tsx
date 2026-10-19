import React, { useEffect, useState } from 'react';
import {
  Table,
  Spin,
  message,
  Modal,
  Button,
  Select,
  Switch,
  Form,
  Input,
  InputNumber,
} from 'antd';
import { ref as dbRef, get, update } from 'firebase/database';
import { db } from '../../firebaseConfig';
import CryptoJS from 'crypto-js';
import { debounce } from 'lodash';

const { Option } = Select;
const AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY;

// AES Helpers
const encryptAES = (plainText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(AES_SECRET_KEY);
    return CryptoJS.AES.encrypt(plainText.trim(), key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  } catch {
    return plainText;
  }
};

const decryptAES = (encryptedText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(AES_SECRET_KEY);
    const bytes = CryptoJS.AES.decrypt(encryptedText.trim(), key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return bytes.toString(CryptoJS.enc.Utf8) || encryptedText;
  } catch {
    return encryptedText;
  }
};

const safeEncryptAES = (plainText: string): string => {
  try {
    if (!plainText) return '';
    const key = CryptoJS.enc.Utf8.parse(AES_SECRET_KEY);
    const encrypted = CryptoJS.AES.encrypt(plainText.trim(), key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
    return encrypted.replace(/(\r\n|\n|\r|\s)/gm, '');
  } catch {
    return plainText;
  }
};

const safeDecryptAES = (encryptedText: string): string => {
  try {
    if (!encryptedText) return '';
    const sanitized = encryptedText.trim().replace(/(\r\n|\n|\r|\s)/gm, '');
    const key = CryptoJS.enc.Utf8.parse(AES_SECRET_KEY);
    const bytes = CryptoJS.AES.decrypt(sanitized, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return bytes.toString(CryptoJS.enc.Utf8) || encryptedText;
  } catch {
    return encryptedText;
  }
};

const ManageUserContributedPyqs: React.FC = () => {
  const [rawData, setRawData] = useState<any>({});
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [sessionOptions, setSessionOptions] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [filteredDocs, setFilteredDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    const ref = dbRef(db, 'version12/Contribution/Pyq');
    get(ref).then((snap) => {
      const val = snap.val() || {};
      setRawData(val);
      setYearOptions(Object.keys(val));
    });
  }, []);

  useEffect(() => {
    if (selectedYear && rawData[selectedYear]) {
      const branches = Object.keys(rawData[selectedYear]);
      setBranchOptions(branches);
      if (selectedBranch && !branches.includes(selectedBranch)) {
        setSelectedBranch(null);
        setSelectedSession(null);
      }
    }
  }, [selectedYear, rawData]);

  useEffect(() => {
    if (!selectedYear || !selectedBranch) return;
    const branchData = rawData[selectedYear]?.[selectedBranch] || {};
    const sessions = Object.keys(branchData);
    setSessionOptions(sessions);
    if (!sessions.includes(selectedSession || '')) {
      setSelectedSession(null);
    }
  }, [selectedBranch, rawData, selectedYear]);

  useEffect(() => {
    if (!selectedYear || !selectedBranch || !selectedSession) {
      setFilteredDocs([]);
      return;
    }
    fetchDocs(selectedYear, selectedBranch, selectedSession);
  }, [selectedSession, selectedBranch, selectedYear]);

  const fetchDocs = async (year: string, branch: string, session: string) => {
    setLoading(true);
    const path = `version12/Contribution/Pyq/${year}/${branch}/${session}`;
    const snap = await get(dbRef(db, path));
    const val = snap.val() || {};
    const arr = Object.entries(val).map(([id, doc]: any) => {
      const [date, time] = decryptAES(doc.uploadTime || '').split(' ');
      return {
        id,
        year,
        branch,
        session,
        documentTitle: decryptAES(doc.documentTitle || ''),
        subjectCode: decryptAES(doc.subjectCode || ''),
        pdfUrl: safeDecryptAES(doc.pdfUrl || ''),
        docType: decryptAES(doc.docType || ''),
        userId: decryptAES(doc.userId || ''),
        uploadDate: date || '',
        uploadTime: time || '',
        likes: doc.likes || 0,
        dislikes: doc.dislikes || 0,
        isVisible: doc.isVisible === 1,
        isVerified: doc.isVerified === 1,
        isDeleted: doc.isDeleted === 1,
      };
    });
    setFilteredDocs(arr);
    setLoading(false);
  };

  const debouncedUpdate = debounce((path: string, payload: any) => {
    update(dbRef(db, path), payload).catch(() => {
      message.error('Update failed');
    });
  }, 500);

  const handleToggle = (rec: any, field: 'isVisible' | 'isVerified' | 'isDeleted') => {
    const path = `version12/Contribution/Pyq/${rec.year}/${rec.branch}/${rec.session}/${rec.id}`;
    const newVal = rec[field] ? 0 : 1;

    setFilteredDocs((prev) =>
      prev.map((doc) => (doc.id === rec.id ? { ...doc, [field]: !doc[field] } : doc))
    );

    debouncedUpdate(path, { [field]: newVal });
  };

  const handleModalOpen = (rec: any) => {
    setSelectedItem(rec);
    setModalVisible(true);
    form.setFieldsValue(rec);
  };

  const handleModalSave = async () => {
    if (!selectedItem) return;
    const vals = await form.validateFields();
    const path = `version12/Contribution/Pyq/${selectedItem.year}/${selectedItem.branch}/${selectedItem.session}/${selectedItem.id}`;

    const payload: any = {
      documentTitle: encryptAES(vals.documentTitle),
      subjectCode: encryptAES(vals.subjectCode),
      pdfUrl: safeEncryptAES(vals.pdfUrl),
      docType: encryptAES(vals.docType),
      session: encryptAES(vals.session),
      userId: encryptAES(vals.userId),
      uploadTime: encryptAES(`${vals.uploadDate} ${vals.uploadTime}`),
      likes: vals.likes,
      dislikes: vals.dislikes,
      isVisible: vals.isVisible ? 1 : 0,
      isVerified: vals.isVerified ? 1 : 0,
      isDeleted: vals.isDeleted ? 1 : 0,
    };

    debouncedUpdate(path, payload);
    message.success('All fields updated');
    setModalVisible(false);

    const updatedLocalDoc = {
      ...selectedItem,
      documentTitle: vals.documentTitle,
      subjectCode: vals.subjectCode,
      pdfUrl: vals.pdfUrl,
      docType: vals.docType,
      session: vals.session,
      userId: vals.userId,
      uploadDate: vals.uploadDate,
      uploadTime: vals.uploadTime,
      likes: vals.likes,
      dislikes: vals.dislikes,
      isVisible: vals.isVisible,
      isVerified: vals.isVerified,
      isDeleted: vals.isDeleted,
    };
    setFilteredDocs((prev) => prev.map((doc) => (doc.id === selectedItem.id ? updatedLocalDoc : doc)));
  };

  const columns = [
    { title: 'Title', dataIndex: 'documentTitle', key: 'documentTitle' },
    { title: 'Subject', dataIndex: 'subjectCode', key: 'subjectCode' },
    {
      title: 'PDF',
      key: 'pdfUrl',
      render: (_: any, rec: any) => (
        <a href={rec.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
          Open
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
      render: (_: any, rec: any) => (
        <Switch checked={rec.isVisible} onChange={() => handleToggle(rec, 'isVisible')} />
      ),
    },
    {
      title: 'Verified',
      key: 'isVerified',
      render: (_: any, rec: any) => (
        <Switch checked={rec.isVerified} onChange={() => handleToggle(rec, 'isVerified')} />
      ),
    },
    {
      title: 'Deleted',
      key: 'isDeleted',
      render: (_: any, rec: any) => (
        <Switch checked={rec.isDeleted} onChange={() => handleToggle(rec, 'isDeleted')} />
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, rec: any) => (
        <Button type="primary" onClick={() => handleModalOpen(rec)}>
          View/Edit
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 className="text-xl font-semibold mb-4">📘 Manage PYQs Contributions</h2>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <Select
          placeholder="Select Year"
          style={{ width: 200 }}
          value={selectedYear || undefined}
          onChange={(val) => { setSelectedYear(val); setSelectedBranch(null); setSelectedSession(null); }}
        >
          {yearOptions.map((y) => (
            <Option key={y} value={y}>{y}</Option>
          ))}
        </Select>

        <Select
          placeholder="Select Branch"
          style={{ width: 200 }}
          value={selectedBranch || undefined}
          onChange={(val) => { setSelectedBranch(val); setSelectedSession(null); }}
          disabled={!selectedYear}
        >
          {branchOptions.map((b) => (
            <Option key={b} value={b}>{b}</Option>
          ))}
        </Select>

        <Select
          placeholder="Select Session"
          style={{ width: 200 }}
          value={selectedSession || undefined}
          onChange={setSelectedSession}
          disabled={!selectedBranch}
        >
          {sessionOptions.map((s) => (
            <Option key={s} value={s}>{s}</Option>
          ))}
        </Select>
      </div>

      {loading ? (
        <Spin size="large" style={{ display: 'block', marginTop: 100 }} />
      ) : selectedYear && selectedBranch && selectedSession ? (
        <Table dataSource={filteredDocs} columns={columns} rowKey="id" pagination={{ pageSize: 8 }} />
      ) : (
        <p>Please select a year, branch and session to view documents.</p>
      )}

      <Modal
        open={modalVisible}
        title="Edit All Fields"
        onCancel={() => setModalVisible(false)}
        onOk={handleModalSave}
        okText="Save"
        destroyOnClose
      >
        <Form layout="vertical" form={form} initialValues={selectedItem || {}} key={selectedItem?.id}>
          <Form.Item name="id" label="Document ID"><Input disabled /></Form.Item>
          <Form.Item name="year" label="Year"><Input disabled /></Form.Item>
          <Form.Item name="branch" label="Branch"><Input disabled /></Form.Item>
          <Form.Item name="session" label="Session"><Input disabled /></Form.Item>
          <Form.Item name="userId" label="Uploaded By (User ID)"><Input /></Form.Item>
          <Form.Item name="uploadDate" label="Upload Date"><Input /></Form.Item>
          <Form.Item name="uploadTime" label="Upload Time"><Input /></Form.Item>
          <Form.Item name="likes" label="Likes"><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="dislikes" label="Dislikes"><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="isVisible" label="Visible" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="isVerified" label="Verified" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="isDeleted" label="Deleted" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="documentTitle" label="Document Title" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="subjectCode" label="Subject Code" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="pdfUrl" label="PDF URL" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="docType" label="Document Type"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ManageUserContributedPyqs;
