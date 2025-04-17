import React, { useEffect, useState } from 'react';
import {
  Table,
  Select,
  Button,
  Input,
  Modal,
  Form,
  Switch,
  message,
  Spin,
  Popconfirm,
  Image,
  Upload,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { db, storage } from '../../firebaseConfig';
import {
  ref as dbRef,
  onValue,
  get,
  update,
  remove,
} from 'firebase/database';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import CryptoJS from 'crypto-js';

const { Option } = Select;

const OPPORTUNITIES_AES_SECRET_KEY =
  import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY as string;

function decryptAES(encryptedText: string): string {
  try {
    const key = CryptoJS.enc.Utf8.parse(OPPORTUNITIES_AES_SECRET_KEY);
    const dec = CryptoJS.AES.decrypt(encryptedText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return dec.toString(CryptoJS.enc.Utf8) || encryptedText;
  } catch {
    return encryptedText;
  }
}

function encryptAES(plainText: string): string {
  try {
    const key = CryptoJS.enc.Utf8.parse(OPPORTUNITIES_AES_SECRET_KEY);
    return CryptoJS.AES.encrypt(plainText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  } catch {
    return plainText;
  }
}

interface Opportunity {
  id: string;
  title: string;
  companyName: string;
  jobProfile: string;
  salary: string;
  description: string;
  location: string;
  applyLink: string;
  applyByDate: string;
  type: string;
  logoUrl: string;
  isRemote: boolean;
  isVisible: boolean;
  createdDate: string;
  createdTime: string;
}

export const ManageOpportunities: React.FC = () => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [filtered, setFiltered] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState<'ALL' | 'Internship' | 'Job'>('ALL');

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editForm] = Form.useForm();
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>('');

  // Load and decrypt data
  useEffect(() => {
    setLoading(true);
    const oppRef = dbRef(db, 'version12/Placement/Opportunities');
    return onValue(oppRef, (snapshot) => {
      const raw = snapshot.val() || {};
      const list: Opportunity[] = Object.values(raw).map((item: any) => ({
        id: item.id,
        title: decryptAES(item.title),
        companyName: decryptAES(item.companyName),
        jobProfile: decryptAES(item.jobProfile),
        salary: decryptAES(item.salary),
        description: decryptAES(item.description),
        location: decryptAES(item.location),
        applyLink: decryptAES(item.applyLink),
        applyByDate: decryptAES(item.applyByDate),
        type: decryptAES(item.type),
        logoUrl: decryptAES(item.logoUrl),
        isRemote: decryptAES(item.isRemote) === 'true',
        isVisible: decryptAES(item.isVisible) === 'true',
        createdDate: item.createdDate || '',
        createdTime: item.createdTime || '',
      }));
      setOpportunities(list);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    let list = opportunities;
    if (searchText) {
      const txt = searchText.toLowerCase();
      list = list.filter(
        (opp) =>
          opp.title.toLowerCase().includes(txt) ||
          opp.companyName.toLowerCase().includes(txt) ||
          opp.jobProfile.toLowerCase().includes(txt)
      );
    }
    if (selectedType !== 'ALL') {
      list = list.filter((opp) => opp.type === selectedType);
    }
    setFiltered(list);
  }, [searchText, selectedType, opportunities]);

  const toggleVisibility = async (rec: Opportunity) => {
    await update(
      dbRef(db, `version12/Placement/Opportunities/${rec.id}`),
      { isVisible: encryptAES(String(!rec.isVisible)) }
    );
  };

  const handleEdit = async (rec: Opportunity) => {
    setEditLoading(true);
    const snap = await get(dbRef(db, `version12/Placement/Opportunities/${rec.id}`));
    const raw = snap.val();
    if (!raw) {
      message.error('Failed to load record');
      setEditLoading(false);
      return;
    }
    const full: Opportunity = {
      id: raw.id,
      title: decryptAES(raw.title),
      companyName: decryptAES(raw.companyName),
      jobProfile: decryptAES(raw.jobProfile),
      salary: decryptAES(raw.salary),
      description: decryptAES(raw.description),
      location: decryptAES(raw.location),
      applyLink: decryptAES(raw.applyLink),
      applyByDate: decryptAES(raw.applyByDate),
      type: decryptAES(raw.type),
      logoUrl: decryptAES(raw.logoUrl),
      isRemote: decryptAES(raw.isRemote) === 'true',
      isVisible: decryptAES(raw.isVisible) === 'true',
      createdDate: raw.createdDate || '',
      createdTime: raw.createdTime || '',
    };
    setEditingOpportunity(full);
    setLogoUrl(full.logoUrl);
    editForm.setFieldsValue(full);
    setEditModalVisible(true);
    setEditLoading(false);
  };

  const handleUpload = async (file: File) => {
    const path = `opportunity_logos/${Date.now()}_${file.name}`;
    const sref = storageRef(storage, path);
    await uploadBytes(sref, file);
    const url = await getDownloadURL(sref);
    setLogoUrl(url);
    editForm.setFieldValue('logoUrl', url);
    message.success('Logo uploaded');
    return false;
  };

  const handleUpdate = async () => {
    if (!editingOpportunity) return;
    const vals = await editForm.validateFields();
    const payload: any = {
      id: editingOpportunity.id,
      createdDate: editingOpportunity.createdDate,
      createdTime: editingOpportunity.createdTime,
    };
    Object.entries(vals).forEach(([k, v]) => {
      payload[k] = encryptAES(String(v));
    });
    await update(
      dbRef(db, `version12/Placement/Opportunities/${editingOpportunity.id}`),
      payload
    );
    message.success('Updated successfully');
    setEditModalVisible(false);
  };

  const handleDelete = async (id: string) => {
    await remove(dbRef(db, `version12/Placement/Opportunities/${id}`));
    message.success('Deleted');
  };

  const columns = [
    {
      title: 'Logo',
      dataIndex: 'logoUrl',
      render: (u: string) =>
        u ? <Image src={u} width={50} height={50} alt="Logo" /> : null,
    },
    { title: 'Title', dataIndex: 'title' },
    { title: 'Company', dataIndex: 'companyName' },
    { title: 'Job Profile', dataIndex: 'jobProfile' },
    { title: 'Type', dataIndex: 'type' },
    { title: 'Apply By', dataIndex: 'applyByDate' },
    { title: 'Location', dataIndex: 'location' },
    { title: 'Salary', dataIndex: 'salary' },
    { title: 'Created Date', dataIndex: 'createdDate' },
    { title: 'Created Time', dataIndex: 'createdTime' },
    { title: 'Remote', dataIndex: 'isRemote', render: (val: boolean) => (val ? 'Yes' : 'No') },
    {
      title: 'Visible',
      dataIndex: 'isVisible',
      render: (_: any, rec: Opportunity) => (
        <Switch checked={rec.isVisible} onChange={() => toggleVisibility(rec)} />
      ),
    },
    {
      title: 'Actions',
      render: (_: any, rec: Opportunity) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(rec)} />
          <Popconfirm title="Delete this?" onConfirm={() => handleDelete(rec.id)}>
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 bg-white min-h-[80vh]">
      <h2 className="text-xl font-bold mb-4">Manage Opportunities</h2>

      <div className="flex flex-wrap gap-4 mb-4 justify-between">
        <div className="flex gap-3 items-center">
          <Select
            value={selectedType}
            onChange={(v) => setSelectedType(v as any)}
            style={{ width: 150 }}
          >
            <Option value="ALL">All Types</Option>
            <Option value="Internship">Internship</Option>
            <Option value="Job">Job</Option>
          </Select>

          <Input
            placeholder="Search title / company / profile"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
          />
        </div>

        <div><strong>Total:</strong> {filtered.length}</div>
      </div>

      <Spin spinning={loading}>
        <Table
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 8 }}
          rowKey={(rec, idx) => `${rec.id}-${idx}`}
        />
      </Spin>

      <Modal
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        onOk={handleUpdate}
        title="Edit Opportunity"
        destroyOnClose
        okText="Save"
      >
        <Spin spinning={editLoading}>
          <Form form={editForm} layout="vertical">
            {[
              'title',
              'companyName',
              'jobProfile',
              'salary',
              'description',
              'location',
              'applyLink',
              'applyByDate',
              'type'
            ].map((field) => (
              <Form.Item
                key={field}
                name={field}
                label={field.charAt(0).toUpperCase() + field.slice(1)}
                rules={[{ required: true }]}
              >
                {field === 'description' ? (
                  <Input.TextArea rows={3} />
                ) : field === 'type' ? (
                  <Select>
                    <Option value="Internship">Internship</Option>
                    <Option value="Job">Job</Option>
                  </Select>
                ) : (
                  <Input />
                )}
              </Form.Item>
            ))}

            <Form.Item name="logoUrl" label="Logo URL" rules={[{ required: true }]}>
              <Input disabled />
            </Form.Item>

            {logoUrl && <Image src={logoUrl} width={100} alt="Logo Preview" />}

            <Upload beforeUpload={handleUpload} showUploadList={false} accept="image/*">
              <Button icon={<UploadOutlined />}>Upload New Logo</Button>
            </Upload>
            <Button danger style={{ marginLeft: 8 }} onClick={() => { setLogoUrl(''); editForm.setFieldValue('logoUrl', ''); }}>
              Clear Logo
            </Button>

            <Form.Item name="isRemote" label="Is Remote?" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isVisible" label="Is Visible?" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>
        </Spin>
      </Modal>
    </div>
  );
};
