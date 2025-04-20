import React, { useEffect, useState } from 'react';
import { db } from '../../firebaseConfig';
import {
  onValue,
  ref as dbRef,
  remove,
  update,
} from 'firebase/database';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  message,
  Space,
  Popconfirm,
} from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import CryptoJS from 'crypto-js';
import dayjs from 'dayjs';

const INFOCARDS_AES_SECRET_KEY = import.meta.env.VITE_AES_SECRET_KEY;

const decryptAES = (cipherText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(INFOCARDS_AES_SECRET_KEY);
    const decrypted = CryptoJS.AES.decrypt(cipherText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Decryption failed:', error);
    return cipherText;
  }
};

const encryptAES = (plainText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(INFOCARDS_AES_SECRET_KEY);
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

interface InfoCard {
  id: string;
  head: string;
  body: string;
  bg: string;
  rank: number;
  date: string;
  time: string;
}

const ManageInfoCards: React.FC = () => {
  const [infoCards, setInfoCards] = useState<InfoCard[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingCard, setEditingCard] = useState<InfoCard | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    const cardsRef = dbRef(db, 'version12/infoCards');
    const unsubscribe = onValue(cardsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const loadedCards = Object.entries(data).map(([id, value]: any) => ({
          id,
          head: decryptAES(value.head),
          body: decryptAES(value.body),
          bg: decryptAES(value.bg),
          rank: parseInt(value.rank), // rank is now stored as plain number
          date: value.date || '',
          time: value.time || '',
        }));
        setInfoCards(loadedCards.sort((a, b) => a.rank - b.rank));
      }
    });

    return () => unsubscribe();
  }, []);

  const showEditModal = (card: InfoCard) => {
    setEditingCard(card);
    form.setFieldsValue({
      head: card.head,
      body: card.body,
      bg: card.bg,
      rank: card.rank,
    });
    setIsModalVisible(true);
  };

  const handleModalOk = async () => {
    const values = await form.validateFields();
    if (!values.head || !values.body || !values.bg || values.rank == null) {
      message.error('Please fill in all fields');
      return;
    }

    const { head, body, bg, rank } = values;

    const updatedCard = {
      head: encryptAES(head),
      body: encryptAES(body),
      bg: encryptAES(bg),
      rank: Number(rank), // store as plain number
      date: dayjs().format('DD/MM/YYYY'),
      time: dayjs().format('HH:mm A'),
    };

    try {
      await update(dbRef(db, `version12/infoCards/${editingCard?.id}`), updatedCard);
      message.success('Info card updated successfully!');
      setIsModalVisible(false);
      setEditingCard(null);
    } catch (error) {
      message.error('Failed to update info card.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(dbRef(db, `version12/infoCards/${id}`));
      message.success('Info card deleted successfully!');
    } catch (error) {
      message.error('Failed to delete info card.');
    }
  };

  const columns = [
    {
      title: 'Heading',
      dataIndex: 'head',
      key: 'head',
    },
    {
      title: 'Body',
      dataIndex: 'body',
      key: 'body',
    },
    {
      title: 'Background',
      dataIndex: 'bg',
      key: 'bg',
      render: (bg: string) => (
        <div style={{ backgroundColor: bg, padding: '5px 10px', borderRadius: 4 }}>
          {bg}
        </div>
      ),
    },
    {
      title: 'Rank',
      dataIndex: 'rank',
      key: 'rank',
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
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: InfoCard) => (
        <Space>
          <Button onClick={() => showEditModal(record)}>Edit</Button>
          <Popconfirm
            title="Are you sure to delete this card?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="link" danger>
              <DeleteOutlined className="text-lg" />
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ margin: 20 }}>
      <h2>Manage Info Cards</h2>
      <Table
        dataSource={infoCards}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 5 }}
      />

      <Modal
        title="Edit Info Card"
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Heading"
            name="head"
            rules={[{ required: true, message: 'Please enter a heading' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Body"
            name="body"
            rules={[{ required: true, message: 'Please enter the body' }]}
          >
            <Input.TextArea />
          </Form.Item>
          <Form.Item
            label="Background Color"
            name="bg"
            rules={[{ required: true, message: 'Please enter a background color' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Rank"
            name="rank"
            rules={[{ required: true, message: 'Please enter a rank' }]}
          >
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ManageInfoCards;
