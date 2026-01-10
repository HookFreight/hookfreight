import type { Request, Response } from "express";


export const testController = {

    getTest: async (req: Request, res: Response) => {
        res.json({ message: "Hello, world!" });
    }
}