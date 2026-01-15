import type { Request, Response } from "express";


export const testController = {

    getTest: async (req: Request, res: Response) => {
        res.json({ message: "Hello, world!" });
    },
    
    postTest: async (req: Request, res: Response) => {
        console.log(req.body);
        res.json({ message: "Message received" });
    }
}