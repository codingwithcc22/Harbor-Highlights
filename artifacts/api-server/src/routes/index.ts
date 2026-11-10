import { Router, type IRouter } from "express";
import chatRouter from "./chat";
import dishesRouter from "./dishes";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(chatRouter);
router.use(dishesRouter);
router.use(healthRouter);

export default router;
