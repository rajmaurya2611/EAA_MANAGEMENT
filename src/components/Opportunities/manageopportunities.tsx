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
  DatePicker,
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
  deleteObject,
} from 'firebase/storage';
import CryptoJS from 'crypto-js';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

// same default asset as Add flow
import defaultLogo from '../../assets/Default logo 1.png';

dayjs.extend(customParseFormat);

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
  applyByDate: string; // 'DD-MM-YYYY'
  type: string;
  logoUrl: string;
  logoPath: string;
  isRemote: boolean;   // still 'true'/'false' encrypted
  isVisible: boolean;  // now '1'/'0' encrypted
  createdDate: string; // 'DD/MM/YYYY'
  createdTime: string; // 'HH:mm:ss'
}
type Logo = { url: string; path: string };

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

  // Row action loaders
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Logo lifecycle in Edit
  const [originalLogo, setOriginalLogo] = useState<Logo | null>(null);
  const [stagedLogo, setStagedLogo] = useState<Logo | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  const isPast = (rec: Opportunity) => {
    const d = dayjs(rec.applyByDate, 'DD-MM-YYYY', true);
    if (!d.isValid()) return false;
    return d.endOf('day').isBefore(dayjs());
  };

  async function deleteWithRetry(fullPath: string, maxTries = 3): Promise<
    { ok: true; alreadyMissing?: boolean } | { ok: false; code?: string; err?: unknown }
  > {
    const ref = storageRef(storage, fullPath);
    const backoff = [250, 600, 1200];
    for (let i = 0; i < maxTries; i++) {
      try {
        await deleteObject(ref);
        return { ok: true };
      } catch (e: any) {
        if (e?.code === 'storage/object-not-found') return { ok: true, alreadyMissing: true };
        if (i === maxTries - 1) return { ok: false, code: e?.code, err: e };
        await sleep(backoff[Math.min(i, backoff.length - 1)]);
      }
    }
    return { ok: false, code: 'unknown' };
  }

  const ensureDummyLogo = async (id: string): Promise<Logo> => {
    const resp = await fetch(defaultLogo);
    if (!resp.ok) throw new Error('Failed to load default logo asset');
    const blob = await resp.blob();
    const ext =
      blob.type === 'image/webp' ? 'webp' :
      blob.type === 'image/png'  ? 'png'  :
      blob.type === 'image/jpeg' ? 'jpg'  : 'png';
    const path = `opportunity_logos/dummy/${id}.${ext}`;
    const sref = storageRef(storage, path);
    await uploadBytes(sref, blob, { contentType: blob.type });
    const url = await getDownloadURL(sref);
    return { url, path: sref.fullPath };
  };

  // ---------- load & sort, then auto-enforce visibility=0 for past ----------
  useEffect(() => {
    setLoading(true);
    const oppRef = dbRef(db, 'version12/Placement/Opportunities');
    return onValue(oppRef, async (snapshot) => {
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
        logoPath: decryptAES(item.logoPath || ''),
        isRemote: decryptAES(item.isRemote) === 'true', // unchanged
        isVisible: decryptAES(item.isVisible) === '1',  // 1/0 decode
        createdDate: item.createdDate || '',
        createdTime: item.createdTime || '',
      }));

      const sorted = list.slice().sort((a, b) => {
        const ta = dayjs(`${a.createdDate} ${a.createdTime}`, 'DD/MM/YYYY HH:mm:ss').valueOf();
        const tb = dayjs(`${b.createdDate} ${b.createdTime}`, 'DD/MM/YYYY HH:mm:ss').valueOf();
        return tb - ta; // latest first
      });

      setOpportunities(sorted);
      setLoading(false);

      // auto-flip any past & visible to 0 (non-blocking)
      const toFlip = sorted.filter(r => isPast(r) && r.isVisible);
      if (toFlip.length) {
        await Promise.allSettled(
          toFlip.map(rec =>
            update(
              dbRef(db, `version12/Placement/Opportunities/${rec.id}`),
              { isVisible: encryptAES('0') } // set 0
            )
          )
        );
      }
    });
  }, []);

  // ---------- filter ----------
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

  // ---------- toggle visible (manual for non-past) WITH fresh row + optimistic flip ----------
  const toggleVisibility = async (rec: Opportunity) => {
    const current = opportunities.find(o => o.id === rec.id) ?? rec; // fresh row
    if (isPast(current)) return; // guard
    setTogglingId(current.id);
    try {
      const next = current.isVisible ? '0' : '1';
      await update(
        dbRef(db, `version12/Placement/Opportunities/${current.id}`),
        { isVisible: encryptAES(next) }
      );
      // optimistic UI flip
      setOpportunities(prev =>
        prev.map(o => (o.id === current.id ? { ...o, isVisible: !current.isVisible } : o))
      );
    } finally {
      setTogglingId(null);
    }
  };

  // ---------- open edit ----------
  const handleEdit = async (rec: Opportunity) => {
    setEditLoading(true);
    try {
      const snap = await get(dbRef(db, `version12/Placement/Opportunities/${rec.id}`));
      const raw = snap.val();
      if (!raw) {
        message.error('Failed to load record');
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
        logoPath: decryptAES(raw.logoPath || ''),
        isRemote: decryptAES(raw.isRemote) === 'true',
        isVisible: decryptAES(raw.isVisible) === '1', // 1/0 decode
        createdDate: raw.createdDate || '',
        createdTime: raw.createdTime || '',
      };
      setEditingOpportunity(full);
      setOriginalLogo(full.logoUrl ? { url: full.logoUrl, path: full.logoPath || '' } : null);
      setStagedLogo(null);
      setPreviewUrl(full.logoUrl || '');

      // set fields; convert applyByDate -> dayjs for DatePicker
      editForm.setFieldsValue({
        ...full,
        logoUrl: full.logoUrl,
        applyByDate: full.applyByDate ? dayjs(full.applyByDate, 'DD-MM-YYYY') : null,
      });
      setEditModalVisible(true);
    } finally {
      setEditLoading(false);
    }
  };

  // ---------- stage: upload new ----------
  const handleUpload = async (file: File) => {
    if (!editingOpportunity) return false;
    if (savingEdit || uploadingLogo) return false;

    setUploadingLogo(true);
    try {
      if (stagedLogo?.path) {
        await deleteWithRetry(stagedLogo.path);
        setStagedLogo(null);
      }
      const id = editingOpportunity.id;
      const path = `opportunity_logos/${id}/${Date.now()}_${file.name}`;
      const sref = storageRef(storage, path);
      await uploadBytes(sref, file);
      const url = await getDownloadURL(sref);
      const staged = { url, path: sref.fullPath };
      setStagedLogo(staged);
      setPreviewUrl(url);
      editForm.setFieldValue('logoUrl', url);
      message.success('Logo uploaded (staged)');
    } catch (e) {
      console.error(e);
      message.error('Upload failed');
    } finally {
      setUploadingLogo(false);
    }
    return false;
  };

  // ---------- stage: clear (dummy per-record) ----------
  const handleClearLogo = async () => {
    if (!editingOpportunity) return;
    if (savingEdit || uploadingLogo) return;

    setUploadingLogo(true);
    try {
      if (stagedLogo?.path) {
        await deleteWithRetry(stagedLogo.path);
        setStagedLogo(null);
      }
      const dummy = await ensureDummyLogo(editingOpportunity.id);
      setStagedLogo(dummy);
      setPreviewUrl(dummy.url);
      editForm.setFieldValue('logoUrl', dummy.url);
      message.success('Dummy logo staged');
    } catch (e) {
      console.error(e);
      message.error('Failed to stage dummy logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  // ---------- save (strict) + OPTIMISTIC row update ----------
  const handleUpdate = async () => {
    if (!editingOpportunity) return;
    setSavingEdit(true);
    try {
      const vals = await editForm.validateFields();
      const id = editingOpportunity.id;

      // format date from DatePicker
      const applyBy = vals.applyByDate
        ? dayjs(vals.applyByDate).format('DD-MM-YYYY')
        : editingOpportunity.applyByDate;

      const payload: any = {
        id,
        createdDate: editingOpportunity.createdDate,
        createdTime: editingOpportunity.createdTime,
        title:       encryptAES(String(vals.title)),
        companyName: encryptAES(String(vals.companyName)),
        jobProfile:  encryptAES(String(vals.jobProfile)),
        salary:      encryptAES(String(vals.salary)),
        description: encryptAES(String(vals.description)),
        location:    encryptAES(String(vals.location)),
        applyLink:   encryptAES(String(vals.applyLink)),
        applyByDate: encryptAES(applyBy), // from DatePicker
        type:        encryptAES(String(vals.type)),
        isRemote:    encryptAES(String(vals.isRemote)),          // unchanged
        isVisible:   encryptAES(vals.isVisible ? '1' : '0'),     // 1/0 write
      };

      if (stagedLogo) {
        if (originalLogo?.path) {
          const del = await deleteWithRetry(originalLogo.path);
          if (!del.ok) {
            message.error('Failed to remove old logo. Update aborted.');
            return;
          }
        }
        payload.logoUrl  = encryptAES(stagedLogo.url);
        payload.logoPath = encryptAES(stagedLogo.path);
      } else {
        payload.logoUrl  = encryptAES(originalLogo?.url ?? '');
        payload.logoPath = encryptAES(originalLogo?.path ?? '');
      }

      await update(dbRef(db, `version12/Placement/Opportunities/${id}`), payload);

      // ✅ Optimistically update the row so the toggle unlocks immediately if the new date is future
      const newLogoUrl  = stagedLogo ? stagedLogo.url  : (originalLogo?.url  ?? '');
      const newLogoPath = stagedLogo ? stagedLogo.path : (originalLogo?.path ?? '');
      setOpportunities(prev =>
        prev.map(o =>
          o.id !== id
            ? o
            : {
                ...o,
                title: String(vals.title),
                companyName: String(vals.companyName),
                jobProfile: String(vals.jobProfile),
                salary: String(vals.salary),
                description: String(vals.description),
                location: String(vals.location),
                applyLink: String(vals.applyLink),
                applyByDate: applyBy,
                type: String(vals.type),
                isRemote: Boolean(vals.isRemote),
                isVisible: !!vals.isVisible, // boolean for UI
                logoUrl: newLogoUrl,
                logoPath: newLogoPath,
              }
        )
      );

      if (stagedLogo) {
        setOriginalLogo(stagedLogo);
        setStagedLogo(null);
      }
      message.success('Updated successfully');
      setEditModalVisible(false);
    } catch (e) {
      console.error(e);
      message.error('Update failed');
    } finally {
      setSavingEdit(false);
    }
  };

  // ---------- cancel edit: cleanup staged ----------
  const handleCloseEditModal = async () => {
    try {
      if (stagedLogo?.path) {
        await deleteWithRetry(stagedLogo.path);
      }
    } finally {
      setStagedLogo(null);
      setPreviewUrl(originalLogo?.url || '');
      setEditModalVisible(false);
    }
  };

  // cleanup any staged blob if component unmounts while staged exists
  useEffect(() => {
    return () => {
      if (stagedLogo?.path) {
        deleteWithRetry(stagedLogo.path);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- strict record delete with loader ----------
  const handleDelete = async (id: string) => {
    const rec = opportunities.find(o => o.id === id);
    if (!rec) return;

    setDeletingId(id);
    try {
      if (rec.logoPath) {
        const del = await deleteWithRetry(rec.logoPath);
        if (!del.ok) {
          message.error('Failed to delete logo from storage. Record NOT removed.');
          return;
        }
      }
      await remove(dbRef(db, `version12/Placement/Opportunities/${id}`));
      message.success('Deleted');
    } finally {
      setDeletingId(null);
    }
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
    {
      title: 'Remote',
      dataIndex: 'isRemote',
      render: (val: boolean) => (val ? 'Yes' : 'No'),
    },
    {
      title: 'Visible',
      dataIndex: 'isVisible',
      render: (_: any, rec: Opportunity) => (
        <Switch
          checked={!isPast(rec) && rec.isVisible}
          onChange={() => toggleVisibility(rec)}
          disabled={togglingId === rec.id || isPast(rec)}
          loading={togglingId === rec.id}
        />
      ),
    },
    {
      title: 'Actions',
      render: (_: any, rec: Opportunity) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(rec)} />
          <Popconfirm
            title="Delete this?"
            onConfirm={() => handleDelete(rec.id)}
            okButtonProps={{ loading: deletingId === rec.id }}
            cancelButtonProps={{ disabled: deletingId === rec.id }}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={deletingId === rec.id}
            />
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
          columns={columns as any}
          dataSource={filtered}
          pagination={{ pageSize: 8 }}
          rowKey={(rec) => rec.id}
          rowClassName={(rec: Opportunity) => (isPast(rec) ? 'past-row' : '')}
        />
      </Spin>

      <Modal
        open={editModalVisible}
        onCancel={handleCloseEditModal}
        onOk={handleUpdate}
        title="Edit Opportunity"
        destroyOnClose
        okText="Save"
        okButtonProps={{ loading: savingEdit, disabled: savingEdit || uploadingLogo }}
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
              // 'applyByDate' handled separately below as DatePicker
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

            {/* Apply By Date as DatePicker */}
            <Form.Item
              name="applyByDate"
              label="Apply By Date"
              rules={[{ required: true, message: 'Please pick a date' }]}
            >
              <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} inputReadOnly />
            </Form.Item>

            <Form.Item name="logoUrl" label="Logo URL" rules={[{ required: true }]}>
              <Input disabled />
            </Form.Item>

            {previewUrl && <Image src={previewUrl} width={100} alt="Logo Preview" />}

            <div className="mt-2" style={{ display: 'flex', gap: 8 }}>
              <Upload beforeUpload={handleUpload} showUploadList={false} accept="image/*">
                <Button icon={<UploadOutlined />} disabled={savingEdit} loading={uploadingLogo}>
                  Upload New Logo
                </Button>
              </Upload>
              <Button danger onClick={handleClearLogo} disabled={savingEdit || uploadingLogo}>
                Clear Logo
              </Button>
            </div>

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


// import React, { useEffect, useState } from 'react';
// import {
//   Table,
//   Select,
//   Button,
//   Input,
//   Modal,
//   Form,
//   Switch,
//   message,
//   Spin,
//   Popconfirm,
//   Image,
//   Upload,
// } from 'antd';
// import {
//   EditOutlined,
//   DeleteOutlined,
//   SearchOutlined,
//   UploadOutlined,
// } from '@ant-design/icons';
// import { db, storage } from '../../firebaseConfig';
// import {
//   ref as dbRef,
//   onValue,
//   get,
//   update,
//   remove,
// } from 'firebase/database';
// import {
//   ref as storageRef,
//   uploadBytes,
//   getDownloadURL,
// } from 'firebase/storage';
// import CryptoJS from 'crypto-js';

// const { Option } = Select;

// const OPPORTUNITIES_AES_SECRET_KEY =
//   import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY as string;

// function decryptAES(encryptedText: string): string {
//   try {
//     const key = CryptoJS.enc.Utf8.parse(OPPORTUNITIES_AES_SECRET_KEY);
//     const dec = CryptoJS.AES.decrypt(encryptedText, key, {
//       mode: CryptoJS.mode.ECB,
//       padding: CryptoJS.pad.Pkcs7,
//     });
//     return dec.toString(CryptoJS.enc.Utf8) || encryptedText;
//   } catch {
//     return encryptedText;
//   }
// }

// function encryptAES(plainText: string): string {
//   try {
//     const key = CryptoJS.enc.Utf8.parse(OPPORTUNITIES_AES_SECRET_KEY);
//     return CryptoJS.AES.encrypt(plainText, key, {
//       mode: CryptoJS.mode.ECB,
//       padding: CryptoJS.pad.Pkcs7,
//     }).toString();
//   } catch {
//     return plainText;
//   }
// }

// interface Opportunity {
//   id: string;
//   title: string;
//   companyName: string;
//   jobProfile: string;
//   salary: string;
//   description: string;
//   location: string;
//   applyLink: string;
//   applyByDate: string;
//   type: string;
//   logoUrl: string;
//   isRemote: boolean;
//   isVisible: boolean;
//   createdDate: string;
//   createdTime: string;
// }

// export const ManageOpportunities: React.FC = () => {
//   const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
//   const [filtered, setFiltered] = useState<Opportunity[]>([]);
//   const [loading, setLoading] = useState(false);

//   const [searchText, setSearchText] = useState('');
//   const [selectedType, setSelectedType] = useState<'ALL' | 'Internship' | 'Job'>('ALL');

//   const [editModalVisible, setEditModalVisible] = useState(false);
//   const [editForm] = Form.useForm();
//   const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
//   const [editLoading, setEditLoading] = useState(false);
//   const [logoUrl, setLogoUrl] = useState<string>('');

//   // Load and decrypt data
//   useEffect(() => {
//     setLoading(true);
//     const oppRef = dbRef(db, 'version12/Placement/Opportunities');
//     return onValue(oppRef, (snapshot) => {
//       const raw = snapshot.val() || {};
//       const list: Opportunity[] = Object.values(raw).map((item: any) => ({
//         id: item.id,
//         title: decryptAES(item.title),
//         companyName: decryptAES(item.companyName),
//         jobProfile: decryptAES(item.jobProfile),
//         salary: decryptAES(item.salary),
//         description: decryptAES(item.description),
//         location: decryptAES(item.location),
//         applyLink: decryptAES(item.applyLink),
//         applyByDate: decryptAES(item.applyByDate),
//         type: decryptAES(item.type),
//         logoUrl: decryptAES(item.logoUrl),
//         isRemote: decryptAES(item.isRemote) === 'true',
//         isVisible: decryptAES(item.isVisible) === 'true',
//         createdDate: item.createdDate || '',
//         createdTime: item.createdTime || '',
//       }));
//       setOpportunities(list);
//       setLoading(false);
//     });
//   }, []);

//   useEffect(() => {
//     let list = opportunities;
//     if (searchText) {
//       const txt = searchText.toLowerCase();
//       list = list.filter(
//         (opp) =>
//           opp.title.toLowerCase().includes(txt) ||
//           opp.companyName.toLowerCase().includes(txt) ||
//           opp.jobProfile.toLowerCase().includes(txt)
//       );
//     }
//     if (selectedType !== 'ALL') {
//       list = list.filter((opp) => opp.type === selectedType);
//     }
//     setFiltered(list);
//   }, [searchText, selectedType, opportunities]);

//   const toggleVisibility = async (rec: Opportunity) => {
//     await update(
//       dbRef(db, `version12/Placement/Opportunities/${rec.id}`),
//       { isVisible: encryptAES(String(!rec.isVisible)) }
//     );
//   };

//   const handleEdit = async (rec: Opportunity) => {
//     setEditLoading(true);
//     const snap = await get(dbRef(db, `version12/Placement/Opportunities/${rec.id}`));
//     const raw = snap.val();
//     if (!raw) {
//       message.error('Failed to load record');
//       setEditLoading(false);
//       return;
//     }
//     const full: Opportunity = {
//       id: raw.id,
//       title: decryptAES(raw.title),
//       companyName: decryptAES(raw.companyName),
//       jobProfile: decryptAES(raw.jobProfile),
//       salary: decryptAES(raw.salary),
//       description: decryptAES(raw.description),
//       location: decryptAES(raw.location),
//       applyLink: decryptAES(raw.applyLink),
//       applyByDate: decryptAES(raw.applyByDate),
//       type: decryptAES(raw.type),
//       logoUrl: decryptAES(raw.logoUrl),
//       isRemote: decryptAES(raw.isRemote) === 'true',
//       isVisible: decryptAES(raw.isVisible) === 'true',
//       createdDate: raw.createdDate || '',
//       createdTime: raw.createdTime || '',
//     };
//     setEditingOpportunity(full);
//     setLogoUrl(full.logoUrl);
//     editForm.setFieldsValue(full);
//     setEditModalVisible(true);
//     setEditLoading(false);
//   };

//   const handleUpload = async (file: File) => {
//     const path = `opportunity_logos/${Date.now()}_${file.name}`;
//     const sref = storageRef(storage, path);
//     await uploadBytes(sref, file);
//     const url = await getDownloadURL(sref);
//     setLogoUrl(url);
//     editForm.setFieldValue('logoUrl', url);
//     message.success('Logo uploaded');
//     return false;
//   };

//   const handleUpdate = async () => {
//     if (!editingOpportunity) return;
//     const vals = await editForm.validateFields();
//     const payload: any = {
//       id: editingOpportunity.id,
//       createdDate: editingOpportunity.createdDate,
//       createdTime: editingOpportunity.createdTime,
//     };
//     Object.entries(vals).forEach(([k, v]) => {
//       payload[k] = encryptAES(String(v));
//     });
//     await update(
//       dbRef(db, `version12/Placement/Opportunities/${editingOpportunity.id}`),
//       payload
//     );
//     message.success('Updated successfully');
//     setEditModalVisible(false);
//   };

//   const handleDelete = async (id: string) => {
//     await remove(dbRef(db, `version12/Placement/Opportunities/${id}`));
//     message.success('Deleted');
//   };

//   const columns = [
//     {
//       title: 'Logo',
//       dataIndex: 'logoUrl',
//       render: (u: string) =>
//         u ? <Image src={u} width={50} height={50} alt="Logo" /> : null,
//     },
//     { title: 'Title', dataIndex: 'title' },
//     { title: 'Company', dataIndex: 'companyName' },
//     { title: 'Job Profile', dataIndex: 'jobProfile' },
//     { title: 'Type', dataIndex: 'type' },
//     { title: 'Apply By', dataIndex: 'applyByDate' },
//     { title: 'Location', dataIndex: 'location' },
//     { title: 'Salary', dataIndex: 'salary' },
//     { title: 'Created Date', dataIndex: 'createdDate' },
//     { title: 'Created Time', dataIndex: 'createdTime' },
//     { title: 'Remote', dataIndex: 'isRemote', render: (val: boolean) => (val ? 'Yes' : 'No') },
//     {
//       title: 'Visible',
//       dataIndex: 'isVisible',
//       render: (_: any, rec: Opportunity) => (
//         <Switch checked={rec.isVisible} onChange={() => toggleVisibility(rec)} />
//       ),
//     },
//     {
//       title: 'Actions',
//       render: (_: any, rec: Opportunity) => (
//         <div style={{ display: 'flex', gap: 8 }}>
//           <Button icon={<EditOutlined />} onClick={() => handleEdit(rec)} />
//           <Popconfirm title="Delete this?" onConfirm={() => handleDelete(rec.id)}>
//             <Button danger icon={<DeleteOutlined />} />
//           </Popconfirm>
//         </div>
//       ),
//     },
//   ];

//   return (
//     <div className="p-6 bg-white min-h-[80vh]">
//       <h2 className="text-xl font-bold mb-4">Manage Opportunities</h2>

//       <div className="flex flex-wrap gap-4 mb-4 justify-between">
//         <div className="flex gap-3 items-center">
//           <Select
//             value={selectedType}
//             onChange={(v) => setSelectedType(v as any)}
//             style={{ width: 150 }}
//           >
//             <Option value="ALL">All Types</Option>
//             <Option value="Internship">Internship</Option>
//             <Option value="Job">Job</Option>
//           </Select>

//           <Input
//             placeholder="Search title / company / profile"
//             prefix={<SearchOutlined />}
//             value={searchText}
//             onChange={(e) => setSearchText(e.target.value)}
//             style={{ width: 300 }}
//           />
//         </div>

//         <div><strong>Total:</strong> {filtered.length}</div>
//       </div>

//       <Spin spinning={loading}>
//         <Table
//           columns={columns}
//           dataSource={filtered}
//           pagination={{ pageSize: 8 }}
//           rowKey={(rec, idx) => `${rec.id}-${idx}`}
//         />
//       </Spin>

//       <Modal
//         open={editModalVisible}
//         onCancel={() => setEditModalVisible(false)}
//         onOk={handleUpdate}
//         title="Edit Opportunity"
//         destroyOnClose
//         okText="Save"
//       >
//         <Spin spinning={editLoading}>
//           <Form form={editForm} layout="vertical">
//             {[
//               'title',
//               'companyName',
//               'jobProfile',
//               'salary',
//               'description',
//               'location',
//               'applyLink',
//               'applyByDate',
//               'type'
//             ].map((field) => (
//               <Form.Item
//                 key={field}
//                 name={field}
//                 label={field.charAt(0).toUpperCase() + field.slice(1)}
//                 rules={[{ required: true }]}
//               >
//                 {field === 'description' ? (
//                   <Input.TextArea rows={3} />
//                 ) : field === 'type' ? (
//                   <Select>
//                     <Option value="Internship">Internship</Option>
//                     <Option value="Job">Job</Option>
//                   </Select>
//                 ) : (
//                   <Input />
//                 )}
//               </Form.Item>
//             ))}

//             <Form.Item name="logoUrl" label="Logo URL" rules={[{ required: true }]}>
//               <Input disabled />
//             </Form.Item>

//             {logoUrl && <Image src={logoUrl} width={100} alt="Logo Preview" />}

//             <Upload beforeUpload={handleUpload} showUploadList={false} accept="image/*">
//               <Button icon={<UploadOutlined />}>Upload New Logo</Button>
//             </Upload>
//             <Button danger style={{ marginLeft: 8 }} onClick={() => { setLogoUrl(''); editForm.setFieldValue('logoUrl', ''); }}>
//               Clear Logo
//             </Button>

//             <Form.Item name="isRemote" label="Is Remote?" valuePropName="checked">
//               <Switch />
//             </Form.Item>
//             <Form.Item name="isVisible" label="Is Visible?" valuePropName="checked">
//               <Switch />
//             </Form.Item>
//           </Form>
//         </Spin>
//       </Modal>
//     </div>
//   );
// };
