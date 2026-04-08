/*
SQLyog Ultimate v9.62 
MySQL - 5.7.23-23 : Database - bisublar_bds
*********************************************************************
*/

/*!40101 SET NAMES utf8 */;

/*!40101 SET SQL_MODE=''*/;

/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
CREATE DATABASE /*!32312 IF NOT EXISTS*/`bisublar_bds` /*!40100 DEFAULT CHARACTER SET utf8 COLLATE utf8_unicode_ci */;

USE `bisublar_bds`;

/*Table structure for table `PaymentRecords` */

DROP TABLE IF EXISTS `PaymentRecords`;

CREATE TABLE `PaymentRecords` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenantId` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `amountPaid` decimal(10,2) NOT NULL DEFAULT '0.00',
  `billingMonth` varchar(7) COLLATE utf8_unicode_ci NOT NULL,
  `dueDate` date DEFAULT NULL,
  `paymentDate` date DEFAULT NULL,
  `status` enum('paid','unpaid','partial') COLLATE utf8_unicode_ci DEFAULT 'unpaid',
  `description` varchar(255) COLLATE utf8_unicode_ci DEFAULT 'Monthly Dormitory Fee',
  `semester` varchar(255) COLLATE utf8_unicode_ci NOT NULL DEFAULT '',
  `paymentMethod` enum('cash','bank_transfer','gcash','maya') COLLATE utf8_unicode_ci DEFAULT 'cash',
  `receiptNumber` varchar(255) COLLATE utf8_unicode_ci DEFAULT NULL,
  `recordedBy` int(11) DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  `archivedAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `tenantId` (`tenantId`),
  CONSTRAINT `PaymentRecords_ibfk_1` FOREIGN KEY (`tenantId`) REFERENCES `Tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

/*Data for the table `PaymentRecords` */

/*Table structure for table `Payments` */

DROP TABLE IF EXISTS `Payments`;

CREATE TABLE `Payments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenantId` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `dueDate` date NOT NULL,
  `paymentDate` date DEFAULT NULL,
  `status` enum('paid','unpaid','partial') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `amountPaid` decimal(10,2) NOT NULL DEFAULT '0.00',
  `semester` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'Monthly Dormitory Fee',
  `receiptNumber` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recordedBy` int(11) DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `paymentMethod` enum('cash','gcash','bank_transfer','scholarship') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cash',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_payments_receiptNumber` (`receiptNumber`),
  KEY `idx_payments_tenantId` (`tenantId`),
  KEY `idx_payments_status` (`status`),
  KEY `fk_payments_recordedBy` (`recordedBy`),
  CONSTRAINT `fk_payments_recordedBy` FOREIGN KEY (`recordedBy`) REFERENCES `Users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_payments_tenantId` FOREIGN KEY (`tenantId`) REFERENCES `Tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*Data for the table `Payments` */

/*Table structure for table `Rooms` */

DROP TABLE IF EXISTS `Rooms`;

CREATE TABLE `Rooms` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `roomNumber` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floor` int(11) NOT NULL,
  `capacity` int(11) NOT NULL,
  `status` enum('available','full','maintenance') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'available',
  `description` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rooms_roomNumber` (`roomNumber`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*Data for the table `Rooms` */

insert  into `Rooms`(`id`,`roomNumber`,`floor`,`capacity`,`status`,`description`,`createdAt`,`updatedAt`) values (1,'1',1,6,'available','','2026-03-11 22:26:32','2026-03-12 02:27:25'),(2,'2',1,6,'available','','2026-03-12 01:05:00','2026-03-12 02:11:59');

/*Table structure for table `Tenants` */

DROP TABLE IF EXISTS `Tenants`;

CREATE TABLE `Tenants` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenantNumber` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `firstName` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lastName` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('student','staff','faculty') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'student',
  `department` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `guardianName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `guardianContact` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `roomId` int(11) DEFAULT NULL,
  `status` enum('active','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `paymentMethod` enum('cash','gcash','bank_transfer','scholarship') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cash',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenants_tenantNumber` (`tenantNumber`),
  UNIQUE KEY `uk_tenants_email` (`email`),
  KEY `idx_tenants_roomId` (`roomId`),
  KEY `idx_tenants_status` (`status`),
  KEY `idx_tenants_type` (`type`),
  CONSTRAINT `fk_tenants_roomId` FOREIGN KEY (`roomId`) REFERENCES `Rooms` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*Data for the table `Tenants` */

insert  into `Tenants`(`id`,`tenantNumber`,`firstName`,`lastName`,`email`,`contact`,`type`,`department`,`guardianName`,`guardianContact`,`roomId`,`status`,`createdAt`,`updatedAt`,`paymentMethod`) values (10,'TN-0001','Jeffrey','Peresores','jeffrey.peresores@bisu.edu.ph','09292275743','student','Computer Science',NULL,NULL,1,'active','2026-03-12 02:27:24','2026-03-12 02:27:24','cash');

/*Table structure for table `Users` */

DROP TABLE IF EXISTS `Users`;

CREATE TABLE `Users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('admin') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'admin',
  `resetPasswordToken` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resetPasswordExpire` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*Data for the table `Users` */

insert  into `Users`(`id`,`name`,`email`,`password`,`role`,`resetPasswordToken`,`resetPasswordExpire`,`createdAt`,`updatedAt`) values (1,'Admin','admin@bisu.edu.ph','$2a$12$xqOSzthAe5k2Svt7r6Fwj.a2Uc0ID10deoFGv2xxuJLekDEWKdBJW','admin',NULL,NULL,'2026-03-10 07:17:12','2026-03-11 21:36:20');

/*Table structure for table `Visitors` */

DROP TABLE IF EXISTS `Visitors`;

CREATE TABLE `Visitors` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `visitorName` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenantVisitedId` int(11) NOT NULL,
  `purpose` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `timeIn` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `timeOut` datetime DEFAULT NULL,
  `recordedBy` int(11) DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_visitors_tenantVisitedId` (`tenantVisitedId`),
  KEY `fk_visitors_recordedBy` (`recordedBy`),
  CONSTRAINT `fk_visitors_recordedBy` FOREIGN KEY (`recordedBy`) REFERENCES `Users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_visitors_tenantVisitedId` FOREIGN KEY (`tenantVisitedId`) REFERENCES `Tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*Data for the table `Visitors` */

/* Procedure structure for procedure `sp_ArchiveStudent` */

/*!50003 DROP PROCEDURE IF EXISTS  `sp_ArchiveStudent` */;

DELIMITER $$

/*!50003 CREATE DEFINER=`bisublar_bds`@`%` PROCEDURE `sp_ArchiveStudent`(
  IN p_studentId INT,
  OUT p_result VARCHAR(255)
)
BEGIN
  DECLARE v_roomId INT;
  SELECT roomId INTO v_roomId FROM Students WHERE id = p_studentId;
  -- Archive the student
  UPDATE Students SET status = 'archived', roomId = NULL WHERE id = p_studentId;
  -- Update room if needed
  IF v_roomId IS NOT NULL THEN
    IF (SELECT COUNT(*) FROM Students WHERE roomId = v_roomId AND status = 'active') = 0 THEN
      UPDATE Rooms SET status = 'vacant' WHERE id = v_roomId;
    END IF;
  END IF;
  SET p_result = 'OK';
END */$$
DELIMITER ;

/* Procedure structure for procedure `sp_AssignStudentToRoom` */

/*!50003 DROP PROCEDURE IF EXISTS  `sp_AssignStudentToRoom` */;

DELIMITER $$

/*!50003 CREATE DEFINER=`bisublar_bds`@`%` PROCEDURE `sp_AssignStudentToRoom`(
  IN p_studentId INT,
  IN p_roomId INT,
  OUT p_result VARCHAR(255)
)
BEGIN
  DECLARE v_capacity INT;
  DECLARE v_currentOccupancy INT;
  DECLARE v_oldRoomId INT;
  -- Get room capacity
  SELECT capacity INTO v_capacity FROM Rooms WHERE id = p_roomId;
  IF v_capacity IS NULL THEN
    SET p_result = 'Room not found';
  ELSE
    -- Count current occupants
    SELECT COUNT(*) INTO v_currentOccupancy
    FROM Students WHERE roomId = p_roomId AND status = 'active';
    IF v_currentOccupancy >= v_capacity THEN
      SET p_result = 'Room is at full capacity';
    ELSE
      -- Get old room
      SELECT roomId INTO v_oldRoomId FROM Students WHERE id = p_studentId;
      -- Assign student
      UPDATE Students SET roomId = p_roomId WHERE id = p_studentId;
      -- Update new room status to occupied
      UPDATE Rooms SET status = 'occupied' WHERE id = p_roomId;
      -- Update old room status if it becomes empty
      IF v_oldRoomId IS NOT NULL THEN
        IF (SELECT COUNT(*) FROM Students WHERE roomId = v_oldRoomId AND status = 'active') = 0 THEN
          UPDATE Rooms SET status = 'vacant' WHERE id = v_oldRoomId;
        END IF;
      END IF;
      SET p_result = 'OK';
    END IF;
  END IF;
END */$$
DELIMITER ;

/* Procedure structure for procedure `sp_CheckoutVisitor` */

/*!50003 DROP PROCEDURE IF EXISTS  `sp_CheckoutVisitor` */;

DELIMITER $$

/*!50003 CREATE DEFINER=`bisublar_bds`@`%` PROCEDURE `sp_CheckoutVisitor`(
  IN p_visitorId INT,
  OUT p_result VARCHAR(255)
)
BEGIN
  DECLARE v_timeOut DATETIME;
  SELECT timeOut INTO v_timeOut FROM Visitors WHERE id = p_visitorId;
  IF v_timeOut IS NOT NULL THEN
    SET p_result = 'Visitor already checked out';
  ELSE
    UPDATE Visitors SET timeOut = NOW() WHERE id = p_visitorId;
    SET p_result = 'OK';
  END IF;
END */$$
DELIMITER ;

/* Procedure structure for procedure `sp_GetDashboardStats` */

/*!50003 DROP PROCEDURE IF EXISTS  `sp_GetDashboardStats` */;

DELIMITER $$

/*!50003 CREATE DEFINER=`bisublar_bds`@`%` PROCEDURE `sp_GetDashboardStats`()
BEGIN
  SELECT
    (SELECT COUNT(*) FROM Tenants WHERE status = 'active') AS totalTenants,
    (SELECT COUNT(*) FROM Tenants WHERE status = 'active' AND type = 'student') AS totalStudents,
    (SELECT COUNT(*) FROM Tenants WHERE status = 'active' AND type = 'staff') AS totalStaff,
    (SELECT COUNT(*) FROM Tenants WHERE status = 'active' AND type = 'faculty') AS totalFaculty,
    (SELECT COUNT(*) FROM Rooms) AS totalRooms,
    (SELECT COUNT(*) FROM Rooms WHERE status = 'available') AS availableRooms,
    (SELECT COUNT(*) FROM Rooms WHERE status = 'full') AS fullRooms,
    (SELECT COUNT(*) FROM Rooms WHERE status = 'maintenance') AS maintenanceRooms,
    (SELECT COUNT(*) FROM Payments WHERE status = 'unpaid') AS pendingPayments,
    (SELECT COUNT(*) FROM Payments WHERE status = 'partial') AS partialPayments,
    (SELECT COUNT(*) FROM MaintenanceRequests WHERE status != 'resolved') AS activeRequests,
    (SELECT COUNT(*) FROM Visitors WHERE DATE(timeIn) = CURDATE()) AS todayVisitors,
    (SELECT COALESCE(SUM(amount), 0) FROM Payments) AS totalBilled,
    (SELECT COALESCE(SUM(amountPaid), 0) FROM Payments) AS totalCollected;
END */$$
DELIMITER ;

/* Procedure structure for procedure `sp_GetMonthlyRevenueReport` */

/*!50003 DROP PROCEDURE IF EXISTS  `sp_GetMonthlyRevenueReport` */;

DELIMITER $$

/*!50003 CREATE DEFINER=`bisublar_bds`@`%` PROCEDURE `sp_GetMonthlyRevenueReport`(IN p_year INT)
BEGIN
  SELECT
    MONTH(paymentDate) AS monthNum,
    MONTHNAME(paymentDate) AS monthName,
    COUNT(*) AS paymentCount,
    COALESCE(SUM(amountPaid), 0) AS totalCollected
  FROM Payments
  WHERE YEAR(paymentDate) = p_year AND paymentDate IS NOT NULL
  GROUP BY MONTH(paymentDate), MONTHNAME(paymentDate)
  ORDER BY monthNum;
END */$$
DELIMITER ;

/* Procedure structure for procedure `sp_GetPaymentSummary` */

/*!50003 DROP PROCEDURE IF EXISTS  `sp_GetPaymentSummary` */;

DELIMITER $$

/*!50003 CREATE DEFINER=`bisublar_bds`@`%` PROCEDURE `sp_GetPaymentSummary`(IN p_semester VARCHAR(255))
BEGIN
  SELECT
    p.status,
    COUNT(*) AS totalCount,
    COALESCE(SUM(p.amount), 0) AS totalAmount,
    COALESCE(SUM(p.amountPaid), 0) AS totalPaid,
    COALESCE(SUM(p.amount - p.amountPaid), 0) AS totalBalance
  FROM Payments p
  WHERE (p_semester = '' OR p_semester IS NULL OR p.semester = p_semester)
  GROUP BY p.status;
END */$$
DELIMITER ;

/* Procedure structure for procedure `sp_GetStudentPayments` */

/*!50003 DROP PROCEDURE IF EXISTS  `sp_GetStudentPayments` */;

DELIMITER $$

/*!50003 CREATE DEFINER=`bisublar_bds`@`%` PROCEDURE `sp_GetStudentPayments`(IN p_studentId INT)
BEGIN
  SELECT p.id, p.amount, p.dueDate, p.paymentDate, p.status,
         p.amountPaid, (p.amount - p.amountPaid) AS balance,
         p.semester, p.description, p.receiptNumber,
         p.createdAt
  FROM Payments p
  WHERE p.studentId = p_studentId
  ORDER BY p.dueDate DESC;
END */$$
DELIMITER ;

/* Procedure structure for procedure `sp_GetTenantsByRoom` */

/*!50003 DROP PROCEDURE IF EXISTS  `sp_GetTenantsByRoom` */;

DELIMITER $$

/*!50003 CREATE DEFINER=`bisublar_bds`@`%` PROCEDURE `sp_GetTenantsByRoom`(IN p_roomId INT)
BEGIN
  SELECT t.id, t.firstName, t.lastName, t.email, t.contact, t.type, t.tenantNumber
  FROM Tenants t
  WHERE t.roomId = p_roomId AND t.status = 'active'
  ORDER BY t.lastName, t.firstName;
END */$$
DELIMITER ;

/* Procedure structure for procedure `sp_GetUserByEmail` */

/*!50003 DROP PROCEDURE IF EXISTS  `sp_GetUserByEmail` */;

DELIMITER $$

/*!50003 CREATE DEFINER=`bisublar_bds`@`%` PROCEDURE `sp_GetUserByEmail`(IN p_email VARCHAR(255))
BEGIN SELECT id, name, email, `password`, role FROM Users WHERE email = p_email LIMIT 1; END */$$
DELIMITER ;

/* Procedure structure for procedure `sp_GetVisitorLog` */

/*!50003 DROP PROCEDURE IF EXISTS  `sp_GetVisitorLog` */;

DELIMITER $$

/*!50003 CREATE DEFINER=`bisublar_bds`@`%` PROCEDURE `sp_GetVisitorLog`(
  IN p_startDate DATE,
  IN p_endDate DATE
)
BEGIN
  SELECT v.id, v.visitorName, v.purpose, v.timeIn, v.timeOut,
         s.firstName AS studentFirstName, s.lastName AS studentLastName,
         s.studentIdNumber
  FROM Visitors v
  JOIN Students s ON s.id = v.studentVisitedId
  WHERE (p_startDate IS NULL OR DATE(v.timeIn) >= p_startDate)
    AND (p_endDate IS NULL OR DATE(v.timeIn) <= p_endDate)
  ORDER BY v.timeIn DESC;
END */$$
DELIMITER ;

/* Procedure structure for procedure `sp_RecordPayment` */

/*!50003 DROP PROCEDURE IF EXISTS  `sp_RecordPayment` */;

DELIMITER $$

/*!50003 CREATE DEFINER=`bisublar_bds`@`%` PROCEDURE `sp_RecordPayment`(
  IN p_paymentId INT,
  IN p_amountPaid DECIMAL(10,2),
  OUT p_result VARCHAR(255)
)
BEGIN
  DECLARE v_amount DECIMAL(10,2);
  DECLARE v_currentPaid DECIMAL(10,2);
  DECLARE v_newPaid DECIMAL(10,2);
  DECLARE v_newStatus VARCHAR(10);
  DECLARE v_receipt VARCHAR(255);
  SELECT amount, amountPaid INTO v_amount, v_currentPaid
  FROM Payments WHERE id = p_paymentId;
  IF v_amount IS NULL THEN
    SET p_result = 'Payment not found';
  ELSE
    SET v_newPaid = v_currentPaid + p_amountPaid;
    IF v_newPaid >= v_amount THEN
      SET v_newStatus = 'paid';
      SET v_newPaid = v_amount;
    ELSE
      SET v_newStatus = 'partial';
    END IF;
    -- Generate receipt number
    SET v_receipt = CONCAT('RCP-', DATE_FORMAT(NOW(), '%Y%m%d'), '-', LPAD(p_paymentId, 5, '0'));
    UPDATE Payments
    SET amountPaid = v_newPaid,
        status = v_newStatus,
        paymentDate = CURDATE(),
        receiptNumber = COALESCE(receiptNumber, v_receipt)
    WHERE id = p_paymentId;
    SET p_result = 'OK';
  END IF;
END */$$
DELIMITER ;

/* Procedure structure for procedure `sp_RemoveStudentFromRoom` */

/*!50003 DROP PROCEDURE IF EXISTS  `sp_RemoveStudentFromRoom` */;

DELIMITER $$

/*!50003 CREATE DEFINER=`bisublar_bds`@`%` PROCEDURE `sp_RemoveStudentFromRoom`(
  IN p_studentId INT,
  OUT p_result VARCHAR(255)
)
BEGIN
  DECLARE v_roomId INT;
  SELECT roomId INTO v_roomId FROM Students WHERE id = p_studentId;
  IF v_roomId IS NULL THEN
    SET p_result = 'Student is not assigned to a room';
  ELSE
    UPDATE Students SET roomId = NULL WHERE id = p_studentId;
    -- Check if room is now empty
    IF (SELECT COUNT(*) FROM Students WHERE roomId = v_roomId AND status = 'active') = 0 THEN
      UPDATE Rooms SET status = 'vacant' WHERE id = v_roomId;
    END IF;
    SET p_result = 'OK';
  END IF;
END */$$
DELIMITER ;

/* Procedure structure for procedure `sp_SearchStudents` */

/*!50003 DROP PROCEDURE IF EXISTS  `sp_SearchStudents` */;

DELIMITER $$

/*!50003 CREATE DEFINER=`bisublar_bds`@`%` PROCEDURE `sp_SearchStudents`(
  IN p_search VARCHAR(255),
  IN p_status VARCHAR(20),
  IN p_limit INT,
  IN p_offset INT
)
BEGIN
  SELECT s.*, r.roomNumber, r.floor AS roomFloor
  FROM Students s
  LEFT JOIN Rooms r ON r.id = s.roomId
  WHERE (p_status = '' OR p_status IS NULL OR s.status = p_status)
    AND (p_search = '' OR p_search IS NULL
         OR s.firstName LIKE CONCAT('%', p_search, '%')
         OR s.lastName LIKE CONCAT('%', p_search, '%')
         OR s.studentIdNumber LIKE CONCAT('%', p_search, '%')
         OR s.email LIKE CONCAT('%', p_search, '%'))
  ORDER BY s.createdAt DESC
  LIMIT p_limit OFFSET p_offset;
END */$$
DELIMITER ;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
