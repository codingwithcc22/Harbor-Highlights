import { Router, type IRouter } from "express";
import chatRouter from "./chat";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(chatRouter);
router.use(healthRouter);

export default router;
