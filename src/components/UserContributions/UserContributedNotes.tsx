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
import { ref as dbRef, onValue, onChildChanged, update } from 'firebase/database';
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
  const [form] = Form.useForm();

  useEffect(() => {
    const ref = dbRef(db, 'version12/Contribution/Notes');
    const unsub = onValue(ref, (snap) => {
      const val = snap.val() || {};
      setRawData(val);
      setYearOptions(Object.keys(val));
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (selectedYear && rawData[selectedYear]) {
      const branches = Object.keys(rawData[selectedYear]);
      setBranchOptions(branches);

      // 🔥 Important fix: Only clear branch if invalid
      if (selectedBranch && !branches.includes(selectedBranch)) {
        setSelectedBranch(null);
      }
    }
  }, [selectedYear, rawData]);

  useEffect(() => {
    if (!selectedYear || !selectedBranch) return;
    const path = `version12/Contribution/Notes/${selectedYear}/${selectedBranch}`;
    const ref = dbRef(db, path);

    onValue(ref, (snap) => {
      const val = snap.val() || {};
      const arr = Object.entries(val).map(([id, doc]: any) => {
        const [date, time] = decryptAES(doc.uploadTime || '').split(' ');
        return {
          id,
          year: selectedYear,
          branch: selectedBranch,
          documentTitle: decryptAES(doc.documentTitle || ''),
          subjectCode: decryptAES(doc.subjectCode || ''),
          pdfUrl: safeDecryptAES(doc.pdfUrl || ''),
          docType: decryptAES(doc.docType || ''),
          session: decryptAES(doc.session || ''),
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
    });

    onChildChanged(ref, (snap) => {
      const id = snap.key!;
      const doc = snap.val();
      const [date, time] = decryptAES(doc.uploadTime || '').split(' ');
      const updated = {
        id,
        year: selectedYear,
        branch: selectedBranch,
        documentTitle: decryptAES(doc.documentTitle || ''),
        subjectCode: decryptAES(doc.subjectCode || ''),
        pdfUrl: safeDecryptAES(doc.pdfUrl || ''),
        docType: decryptAES(doc.docType || ''),
        session: decryptAES(doc.session || ''),
        userId: decryptAES(doc.userId || ''),
        uploadDate: date || '',
        uploadTime: time || '',
        likes: doc.likes || 0,
        dislikes: doc.dislikes || 0,
        isVisible: doc.isVisible === 1,
        isVerified: doc.isVerified === 1,
        isDeleted: doc.isDeleted === 1,
      };
      setFilteredDocs((prev) => prev.map((x) => (x.id === id ? updated : x)));
    });
  }, [selectedYear, selectedBranch]);

  const debouncedUpdate = debounce((path: string, payload: any) => {
    update(dbRef(db, path), payload).catch(() => {
      message.error('Update failed');
    });
  }, 500);

  const handleToggle = (rec: any, field: 'isVisible' | 'isVerified' | 'isDeleted') => {
    const path = `version12/Contribution/Notes/${rec.year}/${rec.branch}/${rec.id}`;
    const newVal = rec[field] ? 0 : 1;
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
    const path = `version12/Contribution/Notes/${selectedItem.year}/${selectedItem.branch}/${selectedItem.id}`;

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

    // Local table update
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
      <h2 className="text-xl font-semibold mb-4">📘 Manage Notes Contributions</h2>
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <Select
          placeholder="Select Year"
          style={{ width: 200 }}
          value={selectedYear || undefined}
          onChange={setSelectedYear}
        >
          {yearOptions.map((y) => (
            <Option key={y} value={y}>{y}</Option>
          ))}
        </Select>
        <Select
          placeholder="Select Branch"
          style={{ width: 200 }}
          value={selectedBranch || undefined}
          onChange={setSelectedBranch}
          disabled={!selectedYear}
        >
          {branchOptions.map((b) => (
            <Option key={b} value={b}>{b}</Option>
          ))}
        </Select>
      </div>

      {loading ? (
        <Spin size="large" style={{ display: 'block', marginTop: 100 }} />
      ) : selectedYear && selectedBranch ? (
        <Table dataSource={filteredDocs} columns={columns} rowKey="id" pagination={{ pageSize: 8 }} />
      ) : (
        <p>Please select a year and branch to view documents.</p>
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
          {/* Form fields */}
          <Form.Item name="id" label="Document ID"><Input disabled /></Form.Item>
          <Form.Item name="year" label="Year"><Input disabled /></Form.Item>
          <Form.Item name="branch" label="Branch"><Input disabled /></Form.Item>
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
          <Form.Item name="session" label="Session"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ManageUserContributedNotes;
