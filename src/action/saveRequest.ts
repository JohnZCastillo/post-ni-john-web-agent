
import * as jsondiffpatch from 'jsondiffpatch';
import { Request } from '../schema/schema.js';

type requestType = {
    data: any,
    id: string
}

const saveRequest = async ({ data, id }: requestType) => {

    const diffpatcher = jsondiffpatch.create({
        objectHash: function (obj: any) {
            let decorated: { id: string } = obj;
            return decorated.id;
        },
    });

    const request = await Request.findOne({ workspaceId: id });

    const localCopy = diffpatcher.clone(request?.content);

    if (request == null) {
        throw new Error('Workspace not found');
    }

    const delta = diffpatcher.diff(localCopy, data);

    if (!delta) {
        return null;
    }

    diffpatcher.patch(localCopy, delta);

    await Request.updateOne({ workspaceId: id }, { content: localCopy });

    return localCopy;
}

export default saveRequest;