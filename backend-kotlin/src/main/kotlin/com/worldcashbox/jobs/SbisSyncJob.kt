package com.worldcashbox.jobs

import org.quartz.Job
import org.quartz.JobExecutionContext

class SbisSyncJob : Job {
    override fun execute(context: JobExecutionContext?) {
        // TODO: Implement SBIS sync logic
        println("SBIS sync job executed")
    }
}
