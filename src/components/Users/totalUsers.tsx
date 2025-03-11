import React, { useEffect, useState } from "react";
import { Statistic, Col, Row } from "antd";
import { getDatabase, ref, onValue } from "firebase/database";

const TotalUsers: React.FC = () => {
  const [userCount, setUserCount] = useState<number>(0);

  useEffect(() => {
    const db = getDatabase();
    const usersRef = ref(db, "version12/users");

    const listener = onValue(usersRef, (snapshot) => {
      const val = snapshot.val();
      setUserCount(val ? Object.keys(val).length : 0);
    });

    return () => listener();
  }, []);

  return (
    <Row gutter={16}>
      <Col span={12}>
        <Statistic title="Total Users" value={userCount} />
      </Col>
    </Row>
  );
};

export default TotalUsers;
