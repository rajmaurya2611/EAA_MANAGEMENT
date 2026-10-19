import React, { useEffect, useState } from 'react';
import { Layout, Menu, Spin, Button, Modal, Form, Input, Select, message } from 'antd';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, push, set } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Sider, Content } = Layout;
const { Option } = Select;

const INTERVIEW_QUESTIONS_AES_SECRET_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

// AES encryption
const encryptAES = (plainText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(INTERVIEW_QUESTIONS_AES_SECRET_KEY);
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

interface InterviewQuestionCategory {
  category: string;
  questions: { [id: string]: any };
}

const NewInterviewQuestions: React.FC = () => {
  const [categories, setCategories] = useState<InterviewQuestionCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [modalStep, setModalStep] = useState<number>(1);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [categoryForm] = Form.useForm();
  const [questionModalForm] = Form.useForm();
  const [questionForm] = Form.useForm();
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

  useEffect(() => {
    const questionRef = dbRef(db, 'version12/Placement/Interview_Questions');
    const unsubscribe = onValue(questionRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const catList: InterviewQuestionCategory[] = Object.keys(data).map((cat) => ({
          category: cat,
          questions: data[cat],
        }));
        setCategories(catList);
        if (catList.length > 0 && !selectedCategory) {
          setSelectedCategory(catList[0].category);
        }
      } else {
        setCategories([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [selectedCategory]);

  const handleMenuClick = ({ key }: { key: string }) => setSelectedCategory(key);

  const onFinishStep1 = (values: any) => {
    const catName = values.categoryName.trim();
    if (!catName) {
      message.error('Please enter a valid category name.');
      return;
    }
    if (categories.some((c) => c.category === catName)) {
      message.error('Category already exists.');
      return;
    }
    setNewCategoryName(catName);
    setModalStep(2);
  };

  const addInterviewQuestion = async (values: any, targetCategory: string) => {
    const { question, answer, difficulty, topic, category } = values;
    if (!question || !answer || !difficulty || !topic || !category) {
      message.error('Please fill all required fields.');
      return;
    }
    const now = new Date().toLocaleDateString();
    const questionRef = push(dbRef(db, `version12/Placement/Interview_Questions/${targetCategory}`));
    const questionId = questionRef.key;

    const questionData = {
      id: questionId,
      question: encryptAES(question),
      answer: encryptAES(answer),
      difficulty: encryptAES(difficulty),
      topic: encryptAES(topic),
      category: encryptAES(category),
      views: 0,
      date: now,
    };

    try {
      await set(questionRef, questionData);
      message.success('Interview Question added successfully!');
      questionForm.resetFields();
      questionModalForm.resetFields();
      setModalStep(1);
      setShowAddModal(false);
      setShowSuccessModal(true);
      if (!categories.find((c) => c.category === targetCategory)) {
        setSelectedCategory(targetCategory);
      }
    } catch (err) {
      console.error(err);
      message.error('Failed to add interview question.');
    }
  };

  const onFinishStep2 = (values: any) => addInterviewQuestion(values, newCategoryName);
  const onFinishQuestion = (values: any) => addInterviewQuestion(values, selectedCategory);

  const handleCancelModal = () => {
    setModalStep(1);
    setShowAddModal(false);
    categoryForm.resetFields();
    questionModalForm.resetFields();
  };

  return (
    <>
      <Layout style={{ minHeight: '70vh' }}>
        <Sider width={250} style={{ background: '#fff' }}>
          <Spin spinning={loading} style={{ margin: '20px' }}>
            <Menu
              mode="inline"
              selectedKeys={[selectedCategory]}
              onClick={handleMenuClick}
              style={{ height: 'calc(100% - 50px)', borderRight: 0 }}
            >
              {categories.map((cat) => (
                <Menu.Item key={cat.category}>{cat.category}</Menu.Item>
              ))}
            </Menu>
            <Button
              type="dashed"
              style={{ width: '90%', margin: '10px' }}
              onClick={() => {
                setModalStep(1);
                setShowAddModal(true);
              }}
            >
              Add Category
            </Button>
          </Spin>
        </Sider>

        <Layout style={{ padding: '24px' }}>
          <Content style={{ background: '#fff', padding: 24 }}>
            <h2>Add Interview Question to {selectedCategory}</h2>
            <Form
              form={questionForm}
              layout="vertical"
              onFinish={onFinishQuestion}
              initialValues={{ difficulty: '1' }}
            >
              <Form.Item
                label="Question"
                name="question"
                rules={[{ required: true, message: 'Please enter the question' }]}
              >
                <Input.TextArea placeholder="Enter the interview question" rows={3} />
              </Form.Item>

              <Form.Item
                label="Answer"
                name="answer"
                rules={[{ required: true, message: 'Please enter the answer' }]}
              >
                <Input.TextArea placeholder="Enter the answer" rows={4} />
              </Form.Item>

              <Form.Item
                label="Difficulty"
                name="difficulty"
                rules={[{ required: true, message: 'Please select difficulty' }]}
              >
                <Select>
                  <Option value="1">1</Option>
                  <Option value="2">2</Option>
                  <Option value="3">3</Option>
                </Select>
              </Form.Item>

              <Form.Item
                label="Category"
                name="category"
                rules={[{ required: true, message: 'Please select a category' }]}
              >
                <Select>
                  <Option value="HR">HR</Option>
                  <Option value="Technical">Technical</Option>
                  <Option value="Aptitude">Aptitude</Option>
                </Select>
              </Form.Item>

              <Form.Item
                label="Topic"
                name="topic"
                rules={[{ required: true, message: 'Please enter the topic' }]}
              >
                <Input placeholder="e.g. Arrays, OS, etc." />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit">
                  Add Interview Question
                </Button>
              </Form.Item>
            </Form>
          </Content>
        </Layout>

        <Modal
          open={showAddModal}
          title="Add New Interview Question Category"
          onCancel={handleCancelModal}
          footer={null}
        >
          {modalStep === 1 && (
            <Form form={categoryForm} layout="vertical" onFinish={onFinishStep1}>
              <Form.Item
                label="New Category (e.g. Frontend)"
                name="categoryName"
                rules={[{ required: true, message: 'Please enter category name' }]}
              >
                <Input placeholder="Enter new category name" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit">
                  Next
                </Button>
              </Form.Item>
            </Form>
          )}
          {modalStep === 2 && (
            <Form
              form={questionModalForm}
              layout="vertical"
              onFinish={onFinishStep2}
              initialValues={{ difficulty: '1' }}
            >
              <Form.Item
                label="Question"
                name="question"
                rules={[{ required: true, message: 'Please enter the question' }]}
              >
                <Input.TextArea placeholder="Enter the interview question" rows={3} />
              </Form.Item>

              <Form.Item
                label="Answer"
                name="answer"
                rules={[{ required: true, message: 'Please enter the answer' }]}
              >
                <Input.TextArea placeholder="Enter the answer" rows={4} />
              </Form.Item>

              <Form.Item
                label="Difficulty"
                name="difficulty"
                rules={[{ required: true, message: 'Please select difficulty' }]}
              >
                <Select>
                  <Option value="1">1</Option>
                  <Option value="2">2</Option>
                  <Option value="3">3</Option>
                </Select>
              </Form.Item>

              <Form.Item
                label="Category"
                name="category"
                rules={[{ required: true, message: 'Please select a category' }]}
              >
                <Select>
                  <Option value="HR">HR</Option>
                  <Option value="Technical">Technical</Option>
                  <Option value="Aptitude">Aptitude</Option>
                </Select>
              </Form.Item>

              <Form.Item
                label="Topic"
                name="topic"
                rules={[{ required: true, message: 'Please enter the topic' }]}
              >
                <Input placeholder="e.g. Arrays, OS, etc." />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit">
                  Add Interview Question
                </Button>
              </Form.Item>
            </Form>
          )}
        </Modal>

        <Modal
          open={showSuccessModal}
          title="Success"
          onOk={() => setShowSuccessModal(false)}
          onCancel={() => setShowSuccessModal(false)}
          footer={[
            <Button key="ok" type="primary" onClick={() => setShowSuccessModal(false)}>
              OK
            </Button>,
          ]}
        >
          <p>Your interview question has been added successfully!</p>
        </Modal>
      </Layout>
    </>
  );
};

export default NewInterviewQuestions;


// import React, { useEffect, useState } from 'react';
// import { Layout, Menu, Spin, Button, Modal, Form, Input, Select, message } from 'antd';
// import { db } from '../../firebaseConfig';
// import { ref as dbRef, onValue, push, set } from 'firebase/database';
// import CryptoJS from 'crypto-js';

// const { Sider, Content } = Layout;
// const { Option } = Select;

// const INTERVIEW_QUESTIONS_AES_SECRET_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

// // Encryption function reused from your code
// const encryptAES = (plainText: string): string => {
//   try {
//     const key = CryptoJS.enc.Utf8.parse(INTERVIEW_QUESTIONS_AES_SECRET_KEY);
//     const encrypted = CryptoJS.AES.encrypt(plainText, key, {
//       mode: CryptoJS.mode.ECB,
//       padding: CryptoJS.pad.Pkcs7,
//     });
//     return encrypted.toString();
//   } catch (error) {
//     console.error('Encryption failed:', error);
//     return plainText;
//   }
// };

// interface InterviewQuestionCategory {
//   category: string;
//   questions: { [id: string]: any };
// }

// const NewInterviewQuestions: React.FC = () => {
//   // State for categories stored under Interview_Questions
//   const [categories, setCategories] = useState<InterviewQuestionCategory[]>([]);
//   const [selectedCategory, setSelectedCategory] = useState<string>('');
//   const [loading, setLoading] = useState<boolean>(true);
//   // Modal state for creating a new category and the first question in that category
//   const [showAddModal, setShowAddModal] = useState<boolean>(false);
//   const [modalStep, setModalStep] = useState<number>(1);
//   const [newCategoryName, setNewCategoryName] = useState<string>('');
//   const [categoryForm] = Form.useForm();
//   const [questionModalForm] = Form.useForm();
//   // Main content form to add a question for an existing category
//   const [questionForm] = Form.useForm();
//   const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

//   useEffect(() => {
//     // Listen to Interview_Questions node
//     const questionRef = dbRef(db, 'version12/Placement/Interview_Questions');
//     const unsubscribe = onValue(questionRef, (snapshot) => {
//       const data = snapshot.val();
//       if (data) {
//         const catList: InterviewQuestionCategory[] = Object.keys(data).map((cat) => ({
//           category: cat,
//           questions: data[cat],
//         }));
//         setCategories(catList);
//         // Default to the first category if not already selected
//         if (catList.length > 0 && !selectedCategory) {
//           setSelectedCategory(catList[0].category);
//         }
//       } else {
//         setCategories([]);
//       }
//       setLoading(false);
//     });
//     return () => unsubscribe();
//   }, [selectedCategory]);

//   const handleMenuClick = ({ key }: { key: string }) => setSelectedCategory(key);

//   // Step 1: New category entry – check validity and proceed to step 2
//   const onFinishStep1 = (values: any) => {
//     const catName = values.categoryName.trim();
//     if (!catName) {
//       message.error('Please enter a valid category name.');
//       return;
//     }
//     if (categories.some((c) => c.category === catName)) {
//       message.error('Category already exists.');
//       return;
//     }
//     setNewCategoryName(catName);
//     setModalStep(2);
//   };

//   // Function to add a new interview question
//   // This function is used both from the main form (for an existing category)
//   // and from the new category modal.
//   const addInterviewQuestion = async (values: any, targetCategory: string) => {
//     const { question, answer, difficulty, topic } = values;
//     if (!question || !answer || !difficulty || !topic) {
//       message.error('Please fill all required fields.');
//       return;
//     }
//     const now = new Date().toLocaleDateString();
//     // Create a new record under the target category
//     const questionRef = push(dbRef(db, `version12/Placement/Interview_Questions/${targetCategory}`));
//     const questionId = questionRef.key;
//     const questionData = {
//       id: questionId,
//       question: encryptAES(question), // encrypt the question text
//       answer: encryptAES(answer),     // encrypt the answer text
//       difficulty,
//       topic,
//       views: 0, // initialize with 0 views
//       date: now, // optional date field
//     };

//     try {
//       await set(questionRef, questionData);
//       message.success('Interview Question added successfully!');
//       // Reset both forms when successful
//       questionForm.resetFields();
//       questionModalForm.resetFields();
//       setModalStep(1);
//       setShowAddModal(false);
//       setShowSuccessModal(true);
//       // If this was a new category, update the selected category.
//       if (!categories.find((c) => c.category === targetCategory)) {
//         setSelectedCategory(targetCategory);
//       }
//     } catch (err) {
//       console.error(err);
//       message.error('Failed to add interview question.');
//     }
//   };

//   // Called when user submits step 2 in the new category modal
//   const onFinishStep2 = (values: any) => addInterviewQuestion(values, newCategoryName);
//   // Called when user submits the main form to add a question in the selected category
//   const onFinishQuestion = (values: any) => addInterviewQuestion(values, selectedCategory);
  
//   const handleCancelModal = () => {
//     setModalStep(1);
//     setShowAddModal(false);
//     categoryForm.resetFields();
//     questionModalForm.resetFields();
//   };

//   return (
//     <>
//       <Layout style={{ minHeight: '70vh' }}>
//         <Sider width={250} style={{ background: '#fff' }}>
//           <Spin spinning={loading} style={{ margin: '20px' }}>
//             <Menu
//               mode="inline"
//               selectedKeys={[selectedCategory]}
//               onClick={handleMenuClick}
//               style={{ height: 'calc(100% - 50px)', borderRight: 0 }}
//             >
//               {categories.map((cat) => (
//                 <Menu.Item key={cat.category}>{cat.category}</Menu.Item>
//               ))}
//             </Menu>
//             <Button
//               type="dashed"
//               style={{ width: '90%', margin: '10px' }}
//               onClick={() => {
//                 setModalStep(1);
//                 setShowAddModal(true);
//               }}
//             >
//               Add Category
//             </Button>
//           </Spin>
//         </Sider>

//         <Layout style={{ padding: '24px' }}>
//           <Content style={{ background: '#fff', padding: 24 }}>
//             <h2>Add Interview Question to {selectedCategory}</h2>
//             <Form
//               form={questionForm}
//               layout="vertical"
//               onFinish={onFinishQuestion}
//               initialValues={{ difficulty: '1' }}
//             >
//               <Form.Item
//                 label="Question"
//                 name="question"
//                 rules={[{ required: true, message: 'Please enter the question' }]}
//               >
//                 <Input.TextArea placeholder="Enter the interview question" rows={3} />
//               </Form.Item>
//               <Form.Item
//                 label="Answer"
//                 name="answer"
//                 rules={[{ required: true, message: 'Please enter the answer' }]}
//               >
//                 <Input.TextArea placeholder="Enter the answer" rows={4} />
//               </Form.Item>
//               <Form.Item
//                 label="Difficulty"
//                 name="difficulty"
//                 rules={[{ required: true, message: 'Please select difficulty' }]}
//               >
//                 <Select>
//                   <Option value="1">1</Option>
//                   <Option value="2">2</Option>
//                   <Option value="3">3</Option>
//                 </Select>
//               </Form.Item>
//               <Form.Item
//                 label="Topic"
//                 name="topic"
//                 rules={[{ required: true, message: 'Please enter the topic' }]}
//               >
//                 <Input placeholder="e.g. Programming" />
//               </Form.Item>
//               <Form.Item>
//                 <Button type="primary" htmlType="submit">
//                   Add Interview Question
//                 </Button>
//               </Form.Item>
//             </Form>
//           </Content>
//         </Layout>

//         {/* Modal for adding a new category and an initial question */}
//         <Modal
//           open={showAddModal}
//           title="Add New Interview Question Category"
//           onCancel={handleCancelModal}
//           footer={null}
//         >
//           {modalStep === 1 && (
//             <Form form={categoryForm} layout="vertical" onFinish={onFinishStep1}>
//               <Form.Item
//                 label="New Category (e.g. Data Scientist)"
//                 name="categoryName"
//                 rules={[{ required: true, message: 'Please enter category name' }]}
//               >
//                 <Input placeholder="Enter new category name" />
//               </Form.Item>
//               <Form.Item>
//                 <Button type="primary" htmlType="submit">
//                   Next
//                 </Button>
//               </Form.Item>
//             </Form>
//           )}
//           {modalStep === 2 && (
//             <Form
//               form={questionModalForm}
//               layout="vertical"
//               onFinish={onFinishStep2}
//               initialValues={{ difficulty: '1' }}
//             >
//               <Form.Item
//                 label="Question"
//                 name="question"
//                 rules={[{ required: true, message: 'Please enter the question' }]}
//               >
//                 <Input.TextArea placeholder="Enter the interview question" rows={3} />
//               </Form.Item>
//               <Form.Item
//                 label="Answer"
//                 name="answer"
//                 rules={[{ required: true, message: 'Please enter the answer' }]}
//               >
//                 <Input.TextArea placeholder="Enter the answer" rows={4} />
//               </Form.Item>
//               <Form.Item
//                 label="Difficulty"
//                 name="difficulty"
//                 rules={[{ required: true, message: 'Please select difficulty' }]}
//               >
//                 <Select>
//                   <Option value="1">1</Option>
//                   <Option value="2">2</Option>
//                   <Option value="3">3</Option>
//                 </Select>
//               </Form.Item>
//               <Form.Item
//                 label="Topic"
//                 name="topic"
//                 rules={[{ required: true, message: 'Please enter the topic' }]}
//               >
//                 <Input placeholder="e.g. Programming" />
//               </Form.Item>
//               <Form.Item>
//                 <Button type="primary" htmlType="submit">
//                   Add Interview Question
//                 </Button>
//               </Form.Item>
//             </Form>
//           )}
//         </Modal>

//         {/* Success Modal */}
//         <Modal
//           open={showSuccessModal}
//           title="Success"
//           onOk={() => setShowSuccessModal(false)}
//           onCancel={() => setShowSuccessModal(false)}
//           footer={[
//             <Button key="ok" type="primary" onClick={() => setShowSuccessModal(false)}>
//               OK
//             </Button>,
//           ]}
//         >
//           <p>Your interview question has been added successfully!</p>
//         </Modal>
//       </Layout>
//     </>
//   );
// };

// export default NewInterviewQuestions;
