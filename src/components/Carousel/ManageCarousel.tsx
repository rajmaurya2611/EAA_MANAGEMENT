import React, { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Switch,
  Space,
  Popconfirm,
  message,
  Upload,
  Progress,
  Spin,
} from 'antd';
import {
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { storage, db } from '../../firebaseConfig';
import {
  ref as dbRef,
  onValue,
  update,
  remove,
} from 'firebase/database';
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

const { TextArea } = Input;
const { Dragger } = Upload;

interface CarouselItem {
  id: string;
  image: string;
  description: string;
  head?: string;
  link?: string;
  rank: number;
  isActive: boolean;
  type: 'direct' | 'indirect' | 'default';
  date: string;
  time: string;
}

const templateMap = {
  direct: 'Template 1',
  indirect: 'Template 2',
  default: 'Template 3',
};

const ManageCarousel: React.FC = () => {
  const [items, setItems] = useState<CarouselItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Description modal
  const [descVisible, setDescVisible] = useState(false);
  const [descContent, setDescContent] = useState('');

  // Image preview modal + spinner
  const [imgPreviewVisible, setImgPreviewVisible] = useState(false);
  const [imgPreviewUrl, setImgPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(true);

  // Edit modal
  const [editVisible, setEditVisible] = useState(false);
  const [editForm] = Form.useForm();
  const [editing, setEditing] = useState<CarouselItem | null>(null);
  const [editImage, setEditImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Load all carousel items, sort by rank
  useEffect(() => {
    const ref = dbRef(db, 'version12/Carousel');
    const unsub = onValue(ref, snap => {
      const data = snap.val() || {};
      const arr = Object.entries(data).map(([id, raw]: any) => ({
        id,
        image: raw.image,
        description: raw.description || '',
        head: raw.head,
        link: raw.link,
        rank: raw.rank,
        isActive: raw.isActive,
        type: raw.type,
        date: raw.date,
        time: raw.time,
      })) as CarouselItem[];
      arr.sort((a, b) => a.rank - b.rank);
      setItems(arr);
      setLoading(false);
    });
    return unsub;
  }, []);

  const toggleActive = async (item: CarouselItem, val: boolean) => {
    await update(dbRef(db, `version12/Carousel/${item.id}`), { isActive: val });
    message.success('Status updated');
  };

  const showDescription = (html: string) => {
    setDescContent(html);
    setDescVisible(true);
  };

  const showImagePreview = (url: string) => {
    setPreviewLoading(true);
    setImgPreviewUrl(url);
    setImgPreviewVisible(true);
  };

  const openEdit = (item: CarouselItem) => {
    setEditing(item);
    editForm.setFieldsValue({
      head: item.head,
      description: item.description,
      link: item.link,
      rank: item.rank,
      isActive: item.isActive,
    });
    setEditImage(item.image);
    setEditVisible(true);
  };

  const handleImageUpload = (file: File) => {
    setUploading(true);
    const path = `carousels/${file.name}_${Date.now()}`;
    const ref = storageRef(storage, path);
    const task = uploadBytesResumable(ref, file);
    task.on(
      'state_changed',
      snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      () => {
        message.error('Upload failed');
        setUploading(false);
      },
      async () => {
        const url = await getDownloadURL(ref);
        setEditImage(url);
        message.success('Image uploaded');
        setUploading(false);
      }
    );
    return false;
  };

  const handleRemoveImage = async () => {
    if (!editImage) return;
    try {
      const start = editImage.indexOf('/o/') + 3;
      const end = editImage.indexOf('?');
      const path = decodeURIComponent(editImage.substring(start, end));
      await deleteObject(storageRef(storage, path));
      setEditImage('');
      message.success('Image removed');
    } catch {
      message.error('Failed to remove image');
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    const vals = await editForm.validateFields();
    const updated: any = {
      image: editImage,
      rank: vals.rank,
      isActive: vals.isActive,
      date: editing.date,
      time: editing.time,
    };
    if (editing.type === 'direct') {
      updated.link = vals.link;
    }
    if (editing.type === 'indirect') {
      updated.head = vals.head;
      updated.description = vals.description;
    }
    await update(dbRef(db, `version12/Carousel/${editing.id}`), updated);
    message.success('Saved');
    setEditVisible(false);
  };

  const handleDelete = async (item: CarouselItem) => {
    setLoading(true);
    try {
      const start = item.image.indexOf('/o/') + 3;
      const end = item.image.indexOf('?');
      const path = decodeURIComponent(item.image.substring(start, end));
      await deleteObject(storageRef(storage, path));
    } catch {}
    await remove(dbRef(db, `version12/Carousel/${item.id}`));
    message.success('Deleted');
    setLoading(false);
  };

  const columns = [
    { title: 'Template', dataIndex: 'type', key: 'type', render: (t: keyof typeof templateMap) => templateMap[t] },
    {
      title: 'Image',
      key: 'image',
      render: (_: any, r: CarouselItem) => (
        <Button icon={<EyeOutlined />} onClick={() => showImagePreview(r.image)}>
          Preview
        </Button>
      ),
    },
    {
      title: 'Description',
      key: 'description',
      render: (_: any, r: CarouselItem) =>
        r.type === 'indirect' ? (
          <Button onClick={() => showDescription(r.description)}>View</Button>
        ) : null,
    },
    { title: 'Heading', dataIndex: 'head', key: 'head' },
    {
      title: 'Link',
      dataIndex: 'link',
      key: 'link',
      render: (l: string | undefined) => (l ? <a href={l} target="_blank" rel="noopener">Open</a> : null),
    },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Time', dataIndex: 'time', key: 'time' },
    { title: 'Rank', dataIndex: 'rank', key: 'rank' },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (v: boolean, r: CarouselItem) => (
        <Switch checked={v} onChange={val => toggleActive(r, val)} />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, r: CarouselItem) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openEdit(r)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this item?"
            onConfirm={() => handleDelete(r)}
            okText="Yes"
            cancelText="No"
          >
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, background: '#fff' }}>
      <h2>Manage Carousel</h2>
      <Table rowKey="id" columns={columns} dataSource={items} loading={loading} />

      {/* Description Modal */}
      <Modal
        title="Description"
        open={descVisible}
        footer={null}
        onCancel={() => setDescVisible(false)}
        width={600}
      >
        <div
          dangerouslySetInnerHTML={{ __html: descContent }}
          style={{ maxHeight: '60vh', overflowY: 'auto' }}
        />
      </Modal>

      {/* Image Preview Modal */}
      <Modal
        open={imgPreviewVisible}
        footer={null}
        onCancel={() => setImgPreviewVisible(false)}
        bodyStyle={{ textAlign: 'center' }}
      >
        <Spin spinning={previewLoading}>
          <img
            src={imgPreviewUrl}
            alt="preview"
            style={{ maxWidth: '100%' }}
            onLoad={() => setPreviewLoading(false)}
          />
        </Spin>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title="Edit Carousel Item"
        open={editVisible}
        onCancel={() => setEditVisible(false)}
        onOk={handleSave}
        width={600}
      >
        <Form form={editForm} layout="vertical">
          {editing?.type === 'indirect' && (
            <>
              <Form.Item name="head" label="Heading">
                <Input />
              </Form.Item>
              <Form.Item name="description" label="Description">
                <TextArea rows={3} />
              </Form.Item>
            </>
          )}
          {editing?.type === 'direct' && (
            <Form.Item name="link" label="Link">
              <Input />
            </Form.Item>
          )}
          <Form.Item name="rank" label="Rank" rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="isActive" label="Is Active" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item label="Image">
            {editImage && (
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <img
                  src={editImage}
                  alt="edit"
                  style={{ maxWidth: '100%', borderRadius: 4 }}
                />
                <Button
                  icon={<CloseCircleOutlined />}
                  onClick={handleRemoveImage}
                  type="text"
                  danger
                  style={{ position: 'absolute', top: 8, right: 8 }}
                />
              </div>
            )}
            <Dragger
              beforeUpload={file => handleImageUpload(file as File)}
              showUploadList={false}
              disabled={uploading}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p>Click or drag to upload new image</p>
            </Dragger>
            {uploading && <Progress percent={uploadProgress} />}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ManageCarousel;
